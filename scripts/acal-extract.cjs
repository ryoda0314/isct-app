const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "campus-sns", "academicCalendar.js"), "utf8");
const JP = /[぀-ヿ一-龯]/;
const set = new Set();
const re = /"((?:[^"\\]|\\.)*?)"/g;
let m;
while ((m = re.exec(src))) { const s = m[1]; if (JP.test(s)) set.add(s); }
const arr = [...set].sort();
console.log("distinct JP strings:", arr.length);
fs.writeFileSync(path.join(__dirname, "acal-strings.json"), JSON.stringify(arr, null, 0), "utf8");
console.log(arr.join("\n"));
