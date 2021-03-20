const chromium = require("chrome-aws-lambda");
const { waitDownloadComplete, searchFiles } = require("./util.js");
const { updateJoinInfo } = require("./excelFiileAdapter.js");
require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const web = new WebClient(process.env.SLACK_TOKEN);
const AWS = require("aws-sdk");
AWS.config.loadFromPath("./rootkey.json");
AWS.config.update({ region: "us-east-1" });
const puppeteer = require("puppeteer-core");

var docClient = new AWS.DynamoDB.DocumentClient();

let _page = null;
let _browser = null;

const members = require('./data/members');
const PREFS = require('./data/prefs');
let pref = {};

let targetChannelName;
_channelId = null;

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
  
  await _browser.close();

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

async function postPreNotice(target) {
  pref = PREFS[target];
  targetChannelName = pref.SLACK_CHANNEL_NAME;
  // console.log(pref);

  const skipInfo = await getSkipInfo();

  let devMsg = "";
  if (process.env.ENV == "develop") {
    devMsg = "*開発の途中のため、関係の無いメッセージが表示されていますが気にしないで下さい。*\n";
  }

  let message = "";
  if (!skipInfo.skip) {
    message = `${devMsg}:rotating-light-red:【予告】2分後に${pref.LABEL}の出欠確認をします。Teams会議にまだ参加していない人は至急参加して下さい。\nこの機能は試験運用中です。不具合の出る可能性がありますが、大目に見て下さいね。`;
  } else {
    message = `${devMsg}:information_source:【お知らせ】本日の${pref.LABEL}は${skipInfo.reason}のためお休みです。出欠取得を省略します。`;
    if (skipInfo.addmsg) {
      message = `${message}\n${skipInfo.addmsg}`;
    }
  }

  await web.chat.postMessage({
    channel: await findChannel(),
    text: message,
  });
}

async function postJoinInfo(joinInfo) {
  const members = Object.keys(joinInfo);
  const joinMembers = members.filter((member) => joinInfo[member]);
  const notJoinMembers = members.filter((member) => !joinInfo[member]);
  let devMsg = "";
  if (process.env.ENV == "develop") {
    devMsg = "*開発の途中のため、関係の無いメッセージが表示されていますが気にしないで下さい。*\n";
  }
  await web.chat.postMessage({
    channel: await findChannel(),
    text: `${devMsg}*${pref.LABEL}出欠*\n*出席* : ${joinMembers.length > 0 ? joinMembers.join(", ") : "なし"}\n*欠席* : ${notJoinMembers.length > 0 ? notJoinMembers.join(", ") : "なし"}`,
  });
}

async function postSuccessNotice() {
  await web.chat.postMessage({
    channel: await findChannel(),
    text: ":pencil2: 出欠のExcelファイルに記録しました。",
  });
}

async function findChannel() {
  let channels = (await web.conversations.list()).channels;
  channels = channels.filter((channel) => channel.name == targetChannelName);
  if (channels.length > 0) {
    return channels[0].id;
  }
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
  const meetingBox = await page.$(".ts-calling-thread-header");

  console.log("getJoinMember:5 Join Call On Channel Page");
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

async function downloadFromOneDrive(page = _page) {
  await page.goto(pref.ONEDRIVE_FILE_URL);

  await microsoftLogin(page, true);

  await page.waitForTimeout(1500);
  await waitDownloadComplete("/tmp");
  const files = await searchFiles("/tmp", "xlsx");
  if (files.length > 0) {
    return files[0];
  } else {
    return null;
  }
}

async function uploadToOneDrive(page = _page, filename) {
  await Promise.all([
    page.waitForNavigation({
      waitUntil: "networkidle2",
    }),
    page.goto(pref.ONEDRIVE_FOLDER_URL),
  ]);

  await microsoftLogin(page);

  // const uploadBtn = await page.$('button[name="Upload"]');
  const uploadBtn = await page.$('button[name="アップロード"]');
  await uploadBtn.click();

  const uploadTargetBtns = await page.$$(".ms-ContextualMenu-linkContent");

  for (let i = 0; i < uploadTargetBtns.length; i++) {
    const btn = uploadTargetBtns[i];
    const text = await btn.$eval(".ms-ContextualMenu-itemText", (node) => node.innerText);
    if (text == "ファイル") {
    // if (text == "Files") {
      const [fileChooser] = await Promise.all([page.waitForFileChooser(), btn.click()]);
      await fileChooser.accept([filename]);

      await page.waitForSelector(".OperationMonitor");
      const overrideBtn = await page.$(".OperationMonitor-itemButtonAction");
      // console.log(overrideBtn);
      if (overrideBtn) {
        await overrideBtn.click();
      }

      while (true) {
        await page.waitForTimeout(3000);
        if (!(await page.$('i[data-icon-name="CheckMark"].ms-Icon"'))) {
          continue;
        }
      }
    }
  }
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

async function saveScreenShot(page = _page) {
  // S3に保存
  const jpgBuf = await page.screenshot({ fullPage: true, type: "jpeg" });
  const s3 = new AWS.S3();
  const now = new Date();
  now.setHours(now.getHours() + 9);
  const nowStr = "" + now.getFullYear() + "-" + (now.getMonth() + 1 + "").padStart(2, "0") + "-" + (now.getDate() + "").padStart(2, "0") + " " + (now.getHours() + "").padStart(2, "0") + ":" + (now.getMinutes() + "").padStart(2, "0") + ":" + (now.getSeconds() + "").padStart(2, "0");
  const fileName = nowStr.replace(/[\-:]/g, "_").replace(/\s/g, "__");
  let s3Param = {
    Bucket: "rpaka-screenshots",
    Key: null,
    Body: null,
  };
  s3Param.Key = fileName + ".jpg";
  s3Param.Body = jpgBuf;
  await s3.putObject(s3Param).promise();
}

module.exports = { updateJoinInfoTask, postPreNotice };
