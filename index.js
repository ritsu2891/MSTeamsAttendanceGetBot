const { updateJoinInfoTask, postPreNotice } = require("./syukketu.js");

exports.handler = async function (payload) {
  if (payload.mode == "main") {
    await updateJoinInfoTask(payload.target);
  } else if (payload.mode == "pre") {
    await postPreNotice(payload.target);
  }

  return {
    statusCode: 200,
    body: JSON.stringify("Status was updated"),
  };
};
