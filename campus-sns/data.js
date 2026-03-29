// Default empty structures — live data comes from API/Supabase
const ME={id:"",name:"",av:"",col:"#888",dept:"",yr:0,st:"offline"};
const C=[];
const QData={};
const U=[];
const POSTS=[];
const REPS={};
const MSGS={};
const ASGN0=[];
const MYTK0=[];
const DMS0=[];
const EVENTS0=[];
const GRADES0=[];
const PAST_GPA=[];
const ATT0={};
const REVIEWS0=[];
const NOTIF0=[];
const MYEVENTS0=[];

// Event category config (not data)
const evCat={contest:{l:"コンテスト",c:"#6375f0"},open_lab:{l:"研究室公開",c:"#a855c7"},career:{l:"就活",c:"#d4843e"},community:{l:"コミュニティ",c:"#3dae72"},exam:{l:"試験",c:"#e5534b"},academic:{l:"大学行事",c:"#6366f1"},festival:{l:"大学祭",c:"#f59e0b"}};

// 理工学系の学院・系マスタ（東京科学大学 旧東工大）
const SCHOOLS={
  science:     {name:"理学院",         col:"#6375f0"},
  engineering: {name:"工学院",         col:"#e5534b"},
  matsci:      {name:"物質理工学院",   col:"#3dae72"},
  computing:   {name:"情報理工学院",   col:"#a855c7"},
  lifesci:     {name:"生命理工学院",   col:"#2d9d8f"},
  envsoc:      {name:"環境・社会理工学院",col:"#d4843e"},
};

const DEPTS={
  // 理学院
  MTH:{name:"数学系",       school:"science",     col:"#6375f0"},
  PHY:{name:"物理学系",     school:"science",     col:"#4a7cf7"},
  CHM:{name:"化学系",       school:"science",     col:"#7b93f5"},
  EPS:{name:"地球惑星科学系",school:"science",    col:"#5681e8"},
  // 工学院
  MEC:{name:"機械系",       school:"engineering",  col:"#e5534b"},
  SCE:{name:"システム制御系",school:"engineering", col:"#d96854"},
  EEE:{name:"電気電子系",   school:"engineering",  col:"#c6a236"},
  ICT:{name:"情報通信系",   school:"engineering",  col:"#cf7c3e"},
  IEE:{name:"経営工学系",   school:"engineering",  col:"#b86040"},
  // 物質理工学院
  MAT:{name:"材料系",       school:"matsci",       col:"#3dae72"},
  CAP:{name:"応用化学系",   school:"matsci",       col:"#5cb88a"},
  // 情報理工学院
  MCS:{name:"数理・計算科学系",school:"computing", col:"#a855c7"},
  CSC:{name:"情報工学系",   school:"computing",    col:"#c678dd"},
  // 生命理工学院
  LST:{name:"生命理工学系", school:"lifesci",      col:"#2d9d8f"},
  // 環境・社会理工学院
  ARC:{name:"建築学系",     school:"envsoc",       col:"#d4843e"},
  CVE:{name:"土木・環境工学系",school:"envsoc",    col:"#c6a236"},
  TSE:{name:"融合理工学系", school:"envsoc",       col:"#d19a66"},
  SHS:{name:"社会・人間科学系",school:"envsoc",    col:"#c75d8e"},
  TIM:{name:"イノベーション科学系",school:"envsoc",col:"#56b6c2"},
  MOT:{name:"技術経営専門職学位課程",school:"envsoc",col:"#61afef"},
};

// ユニット（1年生の学院横断少人数グループ）
const UNIT_COL = "#f59e0b"; // ユニット共通カラー

export { ME, C, QData, U, POSTS, REPS, MSGS, ASGN0, MYTK0, DMS0, EVENTS0, evCat, GRADES0, PAST_GPA, ATT0, REVIEWS0, NOTIF0, MYEVENTS0, SCHOOLS, DEPTS, UNIT_COL };
