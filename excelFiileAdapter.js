const XLSX = require("xlsx-populate");
const Utils = XLSX.utils;

let _fileName = "";
let _book = null;
let _sheet = null;

async function readSheet(path = _fileName) {
  _book = await XLSX.fromFileAsync(_fileName);
  _sheet = _book.sheet("Sheet1");
  // console.log(_sheet.range("!ref"));
}

function getMamberMap(sheet = _sheet) {
  let row = 2;
  const rowMap = {};
  const baseCell = sheet.cell(`A2`);
  let cell = baseCell;
  while (cell.value()) {
    rowMap[cell.value()] = row;
    cell = cell.relativeCell(1, 0);
    row++;
  }
  return rowMap;
}

function getDateMap(sheet = _sheet) {
  let col = 2;
  const colMap = {};
  const baseCell = sheet.cell(`B1`);
  let cell = baseCell;
  while (cell.value()) {
    colMap[XLSX.numberToDate(cell.value()).valueOf()] = col;
    cell = cell.relativeCell(0, 1);
    col++;
  }
  return colMap;
}

function updateAttendInfo(attendInfo, date) {
  if (attendInfo.length != Object.keys(getMamberMap()).length) {
    console.log(attendInfo);
    console.log(getMamberMap());
    console.log("出欠情報に過不足があります");
    return;
  }
  console.log(getDateMap());
  const col = getDateMap()[date.valueOf()];
  if (!Number.isInteger(col)) {
    console.log(date);
    console.log(date.valueOf());
    console.log("日付に該当する列が見つかりません");
    return;
  }
  console.log(col);
  let count = 0;
  let cell = _sheet.cell(2, col);
  while (count < attendInfo.length) {
    cell.value(attendInfo[count] ? "〇" : "×");
    cell = cell.relativeCell(1, 0);
    count++;
  }
}

async function updateJoinInfo(fileName, joinInfo) {
  _fileName = fileName;
  await readSheet();
  const memberMap = getMamberMap();
  const members = Object.keys(memberMap);
  console.log(members);
  procJoinInfo = members.map((m) => false);
  members.forEach((member) => {
    procJoinInfo[memberMap[member] - 2] = joinInfo[member];
  });
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  const d = new Date().getDate();
  console.log(`${y} ${m} ${d}`);
  updateAttendInfo(procJoinInfo, new Date(y, m, d));
  await _book.toFileAsync(fileName);
}

//
// updateAttendInfo(
//   [true, false, true, false, true, false, true, false, true, false],
//   new Date(2020, 10, 10)
// );
// XLSX.writeFile(_book, _fileName);

module.exports = { updateJoinInfo };
