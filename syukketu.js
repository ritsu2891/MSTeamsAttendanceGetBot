const chromium = require("chrome-aws-lambda");
const dotenv = require("dotenv");
const AWS = require("aws-sdk");
const puppeteer = require("puppeteer-core");

dotenv.config();
AWS.config.loadFromPath("./rootkey.json");
AWS.config.update({ region: "us-east-1" });
var docClient = new AWS.DynamoDB.DocumentClient();

let _page = null;
let _browser = null;

const members = require('./data/members');
const PREFS = require('./data/prefs');
let pref = {};

// main
async function updateJoinInfoTask(target) {
  process.env["HOME"] = "/var/task";
  pref = PREFS[target];
  targetChannelName = pref.SLACK_CHANNEL_NAME;

  const skipInfo = await getSkipInfo();
  if (skipInfo.skip) {
    return;
  }

  await init();

  // 参加者取得
  console.log("1 - GetJoinMembers");
  let joinMembers = {};
  let getJoinMemberChallenge = 0;
  while (getJoinMemberChallenge < 2) {
    try {
      joinMembers = await getJoinMember();
      break;
    } catch (e) {
      console.log(e);
      await _browser.close();
      await init();
      getJoinMemberChallenge++;
    }
  }

  if (getJoinMemberChallenge >= 2) {
    console.log("1 Failed");
    return false;
  }

  joinMembers = joinMembers.map((name) => name.replace("　", " "));
  console.log(joinMembers);

  let shouldJoinMembers = members.filter((elem) => elem.joinTo.includes(pref.CLASS_IDENTIFIER)).map((elem) => elem.name);
  let joinInfo = {};
  shouldJoinMembers.forEach((shouldJoinMember) => {
    joinInfo[shouldJoinMember] = joinMembers.includes(shouldJoinMember);
  });

  console.log("2 - Post join info to Slack");
  try {
    await postJoinInfo(joinInfo);
  } catch (e) {
    console.log(e);
    console.log('2 Failed');
    return false;
  }

  // 出欠ファイルDL
  // console.log("3 - Donwload join info excel file");
  // await downloadFromOneDrive();

  // 出欠更新
  // console.log("4 - Update join info excel file");
  // await updateJoinInfo(`/tmp/${pref.EXCEL_FILE_NAME}`, joinInfo);

  // 出欠ファイルUP
  // console.log("5 - Upload join info excel file");
  // await uploadToOneDrive(_page, `/tmp/${pref.EXCEL_FILE_NAME}`);

  await _browser.close();
  // await postSuccessNotice();
}

async function init() {
  const args = chromium.args;
  args.push("--use-fake-ui-for-media-stream");
  args.push("--disable-infobars");

  if (process.env.ENV == "develop") {
    _browser = await puppeteer.launch({
      slowMo: 50,
      headless: false,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: args,
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
  } else {
    _browser = await chromium.puppeteer.launch({
      args: args,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
  }
  
  _page = await _browser.newPage();
  await _page._client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: "/tmp",
  });
  await _page.setCacheEnabled(false);
}

async function microsoftLogin(page = _page, lastWaitUntil = true) {
  let currentUrl = new URL(page.url());
  if (currentUrl.host == "login.microsoftonline.com") {
    // #i0116
    await page.waitForSelector("#i0116");
    await page.waitForTimeout(500);
    await page.type("#i0116", process.env.MICROSOFT_ID);
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "networkidle2",
      }),
      await page.click("#idSIButton9"),
    ]);

    // パスワード
    await page.waitForTimeout(500);
    await page.waitForSelector("#i0118");
    await page.type("#i0118", process.env.MICROSOFT_PSWD);
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "networkidle2",
      }),
      await page.click("#idSIButton9"),
    ]);

    // 状態維持？
    currentUrl = new URL(page.url());
    if (currentUrl.host == "login.microsoftonline.com") {
      if (lastWaitUntil) {
        await Promise.all([
          page.waitForNavigation({
            waitUntil: "networkidle2",
          }),
          await page.click("#idBtn_Back"),
        ]);
      } else {
        await page.click("#idBtn_Back");
      }
    }
  }
}

async function getJoinMember(page = _page) {
  console.log(pref);
  console.log("getJoinMember:1 Go to Teams");
  await Promise.all([page.waitForNavigation(), page.goto(pref.TEAMS_CHANNEL_URL)]);
  await page.waitForSelector("#openTeamsClientInBrowser");
  await Promise.all([page.waitForNavigation(), page.click("#openTeamsClientInBrowser")]);

  console.log("getJoinMember:2 Login Microsoft Account");
  await microsoftLogin(page);

  // #download-desktop-page > div > a
  console.log("getJoinMember:3 Deny Desktop App");
  if (await page.$("#download-desktop-page")) {
    await Promise.all([page.waitForNavigation(), page.click("#download-desktop-page > div > a")]);
  }

  //通話を示すボックス
  console.log("getJoinMember:4 Find Call");
  await page.waitForTimeout(10000);
  await page.waitForSelector(".ts-calling-thread-header");
  const meetingBox = await page.$(".ts-calling-thread-header");

  console.log("getJoinMember:5 Join Call On Channel Page");
  await page.waitForSelector(".call-jump-in");
  const callInBtn = await meetingBox.$(".call-jump-in");
  await page.waitForTimeout(5000);
  callInBtn.click();

  // 通話参加直前
  console.log("getJoinMember:6 Join Call");
  await page.waitForSelector("button.join-btn");
  while (true) {
    await page.waitForTimeout(3000);
    if (!!(await page.$("button.join-btn"))) {
      break;
    }
  }
  await page.click("button.join-btn");
  await page.waitForTimeout(10000);

  // await Promise.all([
  //   page.waitForNavigation({
  //     waitUntil: "networkidle2",
  //   }),
  //   ,
  // ]);

  console.log("getJoinMember:7 Open Attendant List");
  let names = null;
  let failCounter = 0;
  while (!names) {
    await page.mouse.move(500, 500);
    await page.mouse.move(550, 550);
    await page.waitForTimeout(1500);
    await page.mouse.move(500, 500);
    await page.mouse.move(550, 550);
    await page.click("#roster-button");
    const rosterSections = await page.$$(".ts-calling-roster-section");
    rosterSections.forEach(async function (rosterSection) {
      const sectionLabel = await rosterSection.$("span.toggle-title");
      if (
        sectionLabel &&
        (await sectionLabel.evaluate(async function (node) {
          return node.innerText;
        })) == (process.env.ENV == "develop" ? "現在この会議に参加中" : "Currently in this meeting")
      ) {
        names = await rosterSection.$$("li.item .ts-user-name");
      }
    });
  }

  console.log("getJoinMember:8 Extract Member List");
  nameLabels = [];
  for (let i = 0; i < names.length; i++) {
    nameLabels.push(await names[i].evaluate((node) => node.innerText));
  }

  console.log("getJoinMember:9 Done");
  return nameLabels;
}

async function getSkipInfo() {
  const skipData = await getData();
  if (skipData && skipData.target == pref.CLASS_IDENTIFIER) {
    return {
      skip: true,
      reason: skipData.reason,
      addmsg: skipData.addmsg
    };
  } else {
    return {
      skip: false,
    };
  }
}

function getData() {
  return new Promise((resolve, reject) => {
    const today = new Date();
    var params = {
      TableName: "syukketu-skip",
      Key: {
        date: `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`,
      },
    };
    docClient.get(params, function (err, data) {
      if (err) {
        console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
        reject();
      } else {
        resolve(data.Item);
      }
    });
  });
}

module.exports = { updateJoinInfoTask };
