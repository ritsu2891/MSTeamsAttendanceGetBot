const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

/*
  ファイルのダウンロード判定
  https://www.sambaiz.net/article/131/ を参考にした
*/

async function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

async function waitDownloadComplete(
  path,
  waitTimeSpan = 1000,
  timeout = 60 * 1000
) {
  return new Promise(async (resolve, reject) => {
    let totalWaitTime = 0;
    while (true) {
      try {
        const completed = await isDownloadComplete(path);
        if (completed) {
          resolve();
          return;
        } else {
          if (totalWaitTime >= timeout) {
            reject("timeout");
            return;
          }
          totalWaitTime += waitTimeSpan;
        }
        await sleep(waitTimeSpan);
      } catch (e) {
        reject(e);
        return;
      }
    }
  });
}

async function isDownloadComplete(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (e, files) => {
      if (e) {
        reject(e);
      } else {
        if (files.length === 0) {
          resolve(false);
          return;
        }
        for (let file of files) {
          if (/.*\.crdownload$/.test(file)) {
            resolve(false);
            return;
          }
        }
        resolve(true);
      }
    });
  });
}

function searchFiles(targetPath, ext) {
  return new Promise((resolve, reject) => {
    fs.readdir(targetPath, (err, files) => {
      if (err) throw err;
      const matcher = new RegExp(`^[^~].+\.${ext}$`);
      files = files.filter((file) => matcher.exec(file) != null);
      resolve(files);
    });
  });
}

async function unarchive(targetPath) {
  let zip = await searchFiles(targetPath, "zip");
  if (zip.length > 0) {
    execSync(`unzip -o ${path.join(targetPath, zip[0])} -d ${targetPath}`);
    return true;
  } else {
    return false;
  }
}

function cleanUp(targetPath) {
  if (targetPath && fs.existsSync(targetPath)) {
    fs.readdir(targetPath, (err, files) => {
      if (err) throw err;
      files.forEach((file) => {
        fs.unlinkSync(path.join(targetPath, file));
      });
      fs.rmdirSync(targetPath);
    });
  }
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

module.exports = { waitDownloadComplete, searchFiles, unarchive, cleanUp, saveScreenShot };
