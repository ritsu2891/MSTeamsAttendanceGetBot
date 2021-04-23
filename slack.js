const { WebClient } = require("@slack/web-api");
const web = new WebClient(process.env.SLACK_TOKEN);

let _targetChannelName;

function init(targetChannelName) {
  _targetChannelName = targetChannelName;
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
  channels = channels.filter((channel) => channel.name == _targetChannelName);
  if (channels.length > 0) {
    return channels[0].id;
  }
}

module.exports = {init, postPreNotice, postJoinInfo}