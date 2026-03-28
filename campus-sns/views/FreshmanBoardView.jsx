import React, { useState, useMemo, useCallback } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { fT } from "../utils.jsx";
import { Av, Tag, Tx, Btn } from "../shared.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { showToast } from "../hooks/useToast.js";

// ── Categories ──
const CATEGORIES=[
  {id:"course_reg",label:"履修登録",icon:I.clip,color:"#6366f1",desc:"履修の組み方、おすすめ科目、単位の取り方など"},
  {id:"circle",label:"サークル・新歓",icon:I.circle,color:"#f59e0b",desc:"サークル紹介、新歓イベント、部活情報など"},
  {id:"campus_life",label:"キャンパスライフ",icon:I.home,color:"#10b981",desc:"学食、施設、通学、生活のコツなど"},
];
const CAT_MAP=Object.fromEntries(CATEGORIES.map(c=>[c.id,c]));

// ── Role badge ──
const RoleBadge=({yr})=>{
  if(!yr) return null;
  const isSenpai=yr>=2;
  return <span style={{fontSize:10,fontWeight:600,padding:"1px 5px",borderRadius:4,
    background:isSenpai?"#3b82f618":"#10b98118",
    color:isSenpai?"#3b82f6":"#10b981",
    border:`1px solid ${isSenpai?"#3b82f630":"#10b98130"}`,
    whiteSpace:"nowrap"}}>{isSenpai?`${yr}年`:"1年"}</span>;
};

// ── Demo data ──
const now=Date.now();
const h=n=>new Date(now-n*3600000);
// yr: 1=新入生, 2+=先輩
const DEMO_BOARD_POSTS=[
  {id:"fb1",cat:"course_reg",uid:"u1",name:"田中太郎",color:"#6366f1",yr:3,text:"1Qで線形代数と微積は必須！早めに取らないと2Q以降きつくなるよ。あとLAH(文系教養)も1年のうちに取るのがおすすめ。",likes:["u3","u5","u7","u8"],commentCount:4,ts:h(2),pinned:true},
  {id:"fb2",cat:"course_reg",uid:"u2",name:"鈴木花子",color:"#ec4899",yr:2,text:"**おすすめの時間割の組み方**\n\n1. 月曜は1-2限を避けると楽\n2. 空きコマは図書館で自習\n3. 実験のある日は前後を空けておくと安心\n\n先輩に聞いたけど、詰めすぎると課題が回らなくなるから注意！",likes:["u1","u4"],commentCount:2,ts:h(5)},
  {id:"fb3",cat:"course_reg",uid:"u3",name:"佐藤健",color:"#3b82f6",yr:2,text:"情報工学系の1年生へ：CSC.T101（プログラミング基礎）は予習してないとついていけないので注意。Pythonの基本だけでも先にやっておくと楽です。",likes:["u2"],commentCount:1,ts:h(8)},
  {id:"fb4",cat:"course_reg",uid:"u6",name:"高橋あかり",color:"#8b5cf6",yr:1,text:"教養科目（文系）のおすすめ教えてください！楽単じゃなくても面白い授業があれば知りたいです。",likes:[],commentCount:6,ts:h(12),type:"question"},
  {id:"fb5",cat:"course_reg",uid:"u9",name:"伊藤翔",color:"#0ea5e9",yr:1,text:"体育は前期に取った方がいいですか？後期でも大丈夫？",likes:["u1"],commentCount:3,ts:h(18),type:"question"},
  {id:"fb6",cat:"circle",uid:"u4",name:"山田美咲",color:"#f59e0b",yr:3,text:"軽音サークル新歓ライブ開催！\n\n日時：4/12（土）14:00〜\n場所：W9棟 多目的ホール\n\n初心者大歓迎！楽器触ったことない人も来てね。見学だけでもOK！",likes:["u1","u2","u3","u5","u6"],commentCount:8,ts:h(1),pinned:true},
  {id:"fb7",cat:"circle",uid:"u5",name:"中村翼",color:"#ef4444",yr:2,text:"プログラミングサークル「ByteForce」です！\n\n活動内容：\n- 週1で勉強会\n- ハッカソン参加\n- Web/アプリ開発\n\nSlackワークスペースに招待するので興味ある人はDMください！",likes:["u3","u7"],commentCount:5,ts:h(4)},
  {id:"fb8",cat:"circle",uid:"u7",name:"小林萌",color:"#14b8a6",yr:1,text:"運動系サークルの新歓情報まとめ（非公式）\n\n- テニス：4/8 体験会\n- バドミントン：4/9 体験会\n- フットサル：4/10 体験会\n- バスケ：4/11 体験会\n\n場所は全部体育館前集合とのこと。",likes:["u1","u2","u4","u6","u8","u9"],commentCount:12,ts:h(6)},
  {id:"fb9",cat:"circle",uid:"u8",name:"渡辺陽斗",color:"#a855f7",yr:1,text:"サークルって何個くらい入るのが普通ですか？掛け持ちしてる人多いですか？",likes:["u5"],commentCount:7,ts:h(15),type:"question"},
  {id:"fb10",cat:"circle",uid:"u10",name:"松本結衣",color:"#e11d48",yr:2,text:"文化系サークルに興味ある人！\n写真部は毎週土曜にキャンパス周辺で撮影会してます。新歓は4/13に大岡山キャンパスの桜の下で。",likes:["u3","u6"],commentCount:3,ts:h(20)},
  {id:"fb11",cat:"campus_life",uid:"u6",name:"高橋あかり",color:"#8b5cf6",yr:1,text:"**新入生が最初に知っておくべきこと**\n\n1. 学生証は常に携帯（図書館・コピー機で必要）\n2. Wi-Fiは「ookayama-wifi」に接続\n3. 学食は12:00〜12:30が激混み。11:30か12:30以降がおすすめ\n4. 生協の教科書販売は早めに行かないと売り切れる\n5. 学バスの時刻表はアプリで確認できる",likes:["u1","u2","u3","u4","u5","u7","u8","u9"],commentCount:15,ts:h(3),pinned:true},
  {id:"fb12",cat:"campus_life",uid:"u1",name:"田中太郎",color:"#6366f1",yr:3,text:"大岡山キャンパスの穴場スポット\n\n- 本館屋上（天気いい日は最高）\n- 西9号館のラウンジ（コンセントあり）\n- 図書館地下（静かで集中できる）\n- 百年記念館のカフェ（空いてる）",likes:["u4","u6","u9"],commentCount:4,ts:h(7)},
  {id:"fb13",cat:"campus_life",uid:"u9",name:"伊藤翔",color:"#0ea5e9",yr:1,text:"すずかけ台キャンパスに行く用事がある人向け：大岡山からバスで約30分。本数少ないから時刻表は要チェック。",likes:["u2"],commentCount:2,ts:h(10)},
  {id:"fb14",cat:"campus_life",uid:"u10",name:"松本結衣",color:"#e11d48",yr:2,text:"一人暮らし始めた人！大岡山駅周辺のスーパー情報：\n\n- まいばすけっと（駅近、小さいけど便利）\n- オオゼキ（品揃え良い、少し歩く）\n- 業務スーパー（安い、自炊派向け）",likes:["u1","u3","u7"],commentCount:6,ts:h(14)},
  {id:"fb15",cat:"campus_life",uid:"u2",name:"鈴木花子",color:"#ec4899",yr:1,text:"通学定期の申請って入学式の日にできますか？それとも事前にやっておくべき？",likes:[],commentCount:4,ts:h(22),type:"question"},
];

const DEMO_COMMENTS={
  fb1:[
    {id:"c1",uid:"u2",name:"鈴木花子",color:"#ec4899",text:"LAHは「哲学A」が面白かったです！",ts:h(1.5)},
    {id:"c2",uid:"u4",name:"山田美咲",color:"#f59e0b",text:"線形代数の教科書はどれ買えばいいですか？",ts:h(1)},
  ],
  fb4:[
    {id:"c3",uid:"u1",name:"田中太郎",color:"#6366f1",text:"「科学技術と社会」おすすめ。レポートだけで成績つく。",ts:h(11)},
    {id:"c4",uid:"u7",name:"小林萌",color:"#14b8a6",text:"「心理学」も人気だけど抽選あるから注意",ts:h(10)},
  ],
  fb6:[
    {id:"c5",uid:"u3",name:"佐藤健",color:"#3b82f6",text:"ギター未経験でも入れますか？",ts:h(0.5)},
    {id:"c6",uid:"u4",name:"山田美咲",color:"#f59e0b",text:"@佐藤健 もちろん！初心者の方が多いよ〜",ts:h(0.3)},
  ],
  fb11:[
    {id:"c7",uid:"u5",name:"中村翼",color:"#ef4444",text:"Wi-Fiのパスワードってどこで確認できる？",ts:h(2.5)},
    {id:"c8",uid:"u6",name:"高橋あかり",color:"#8b5cf6",text:"@中村翼 入学時にもらう書類に書いてあるよ！",ts:h(2)},
    {id:"c9",uid:"u1",name:"田中太郎",color:"#6366f1",text:"あとTISS（学務ポータル）からも確認できます",ts:h(1.8)},
  ],
};

// ── Comment section ──
const CommentSection=({postId,user,onCountChange})=>{
  const [comments,setComments]=useState(()=>DEMO_COMMENTS[postId]||[]);
  const [txt,setTxt]=useState("");
  const send=()=>{
    if(!txt.trim()) return;
    setComments(p=>[...p,{id:`c_${Date.now()}`,uid:user.moodleId||user.id,name:user.name,color:user.col,text:txt.trim(),ts:new Date()}]);
    onCountChange?.(1);
    setTxt("");
    showToast("コメントを投稿しました");
  };
  return(
    <div style={{marginTop:10,borderTop:`1px solid ${T.bd}`,paddingTop:10}}>
      {comments.map(c=>(
        <div key={c.id} style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
          <Av u={{name:c.name,col:c.color}} sz={22}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontWeight:600,fontSize:11,color:c.color||T.txH}}>{c.name}</span>
              <span style={{fontSize:10,color:T.txD}}>{fT(c.ts)}</span>
            </div>
            <div style={{fontSize:13,color:T.tx,lineHeight:1.5}}><Tx>{c.text}</Tx></div>
          </div>
        </div>
      ))}
      <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
        <input value={txt} onChange={e=>setTxt(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="返信を書く..."
          style={{flex:1,padding:"6px 10px",borderRadius:16,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
        <div onClick={send} style={{cursor:"pointer",color:txt.trim()?T.accent:T.txD,display:"flex",opacity:txt.trim()?1:.4}}>{I.send}</div>
      </div>
    </div>
  );
};

// ── Main View ──
export const FreshmanBoardView=({mob})=>{
  const user=useCurrentUser();
  const [cat,setCat]=useState(null); // null = top page, category id = board view
  const [posts,setPosts]=useState(DEMO_BOARD_POSTS);
  const [searchQ,setSearchQ]=useState("");
  const [composing,setComposing]=useState(false);
  const [txt,setTxt]=useState("");
  const [newCat,setNewCat]=useState("course_reg");
  const [openPost,setOpenPost]=useState(null); // post id for thread view
  const [sortBy,setSortBy]=useState("new");

  const userId=user.moodleId||user.id;

  const toggleLike=useCallback((postId)=>{
    setPosts(p=>p.map(post=>{
      if(post.id!==postId) return post;
      const liked=post.likes.includes(userId);
      return {...post,likes:liked?post.likes.filter(u=>u!==userId):[...post.likes,userId]};
    }));
  },[userId]);

  const updateCommentCount=useCallback((postId,delta)=>{
    setPosts(p=>p.map(post=>post.id===postId?{...post,commentCount:(post.commentCount||0)+delta}:post));
  },[]);

  const sendPost=()=>{
    if(!txt.trim()) return;
    const target=cat||newCat;
    setPosts(prev=>[{id:`fb_${Date.now()}`,cat:target,uid:userId,name:user.name,color:user.col,yr:user.yr||1,text:txt.trim(),likes:[],commentCount:0,ts:new Date()},...prev]);
    setTxt("");setComposing(false);
    showToast("投稿しました");
  };

  const catCounts=useMemo(()=>{
    const counts={};
    CATEGORIES.forEach(c=>{counts[c.id]=posts.filter(p=>p.cat===c.id).length;});
    return counts;
  },[posts]);

  const filtered=useMemo(()=>{
    let result=cat?posts.filter(p=>p.cat===cat):posts;
    if(searchQ){
      const q=searchQ.toLowerCase();
      result=result.filter(p=>p.text.toLowerCase().includes(q)||(p.name||"").toLowerCase().includes(q));
    }
    const pinned=result.filter(p=>p.pinned);
    const rest=result.filter(p=>!p.pinned);
    if(sortBy==="popular") rest.sort((a,b)=>b.likes.length-a.likes.length);
    else rest.sort((a,b)=>(b.ts?.getTime?.()||0)-(a.ts?.getTime?.()||0));
    return [...pinned,...rest];
  },[posts,cat,searchQ,sortBy]);

  // ── Thread detail view ──
  const threadPost=openPost?posts.find(p=>p.id===openPost):null;
  if(threadPost){
    const c=CAT_MAP[threadPost.cat];
    const liked=threadPost.likes.includes(userId);
    // Extract first line as thread title
    const lines=threadPost.text.split("\n");
    const title=lines[0].replace(/^\*\*(.+)\*\*$/,"$1").replace(/^#+\s*/,"");
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Thread header */}
        <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"10px 16px",borderBottom:`1px solid ${T.bd}`,background:T.bg2}}>
          <div onClick={()=>setOpenPost(null)} style={{cursor:"pointer",color:T.txD,display:"flex",padding:4,borderRadius:"50%"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{I.back}</div>
          {c&&<div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c.color}}/>
            <span style={{fontSize:12,color:c.color,fontWeight:600}}>{c.label}</span>
          </div>}
          <span style={{fontSize:12,color:T.txD}}>スレッド</span>
        </div>

        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          {/* Thread body */}
          <div style={{padding:mob?16:24}}>
            {/* Author + meta */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <Av u={{name:threadPost.name,col:threadPost.color}} sz={40}/>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontWeight:600,fontSize:14,color:threadPost.color||T.txH}}>{threadPost.name}</span><RoleBadge yr={threadPost.yr}/></div>
                <div style={{fontSize:11,color:T.txD,marginTop:1}}>{fT(threadPost.ts)}</div>
              </div>
              {threadPost.pinned&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,background:`${T.accent}12`,color:T.accent,fontSize:11,fontWeight:600}}>
                <span style={{display:"flex"}}>{I.pin}</span>ピン留め
              </div>}
            </div>

            {/* Tags */}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              {c&&<Tag color={c.color}>{c.label}</Tag>}
              {threadPost.type==="question"&&<Tag color="#f59e0b">質問</Tag>}
            </div>

            {/* Full text */}
            <div style={{fontSize:15,color:T.tx,lineHeight:1.75,whiteSpace:"pre-wrap"}}><Tx>{threadPost.text}</Tx></div>

            {/* Actions */}
            <div style={{display:"flex",gap:16,alignItems:"center",marginTop:16,paddingTop:12,borderTop:`1px solid ${T.bd}`}}>
              <div onClick={()=>toggleLike(threadPost.id)} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",color:liked?T.red:T.txD,fontSize:13,padding:"4px 10px",borderRadius:16,background:liked?T.red+"10":T.bg3,border:`1px solid ${liked?T.red+"30":T.bd}`}}>
                <span style={{display:"flex"}}>{I.heart}</span>
                <span>{threadPost.likes.length}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,color:T.txD,fontSize:13,padding:"4px 10px",borderRadius:16,background:T.bg3,border:`1px solid ${T.bd}`}}>
                <span style={{display:"flex"}}>{I.reply}</span>
                <span>{threadPost.commentCount||0} 件の返信</span>
              </div>
            </div>

            {/* Comments / replies */}
            <div style={{marginTop:16}}>
              <div style={{fontSize:13,fontWeight:600,color:T.txH,marginBottom:8}}>返信</div>
              <CommentSection postId={threadPost.id} user={user} onCountChange={delta=>updateCommentCount(threadPost.id,delta)}/>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Top page (category selection) ──
  if(!cat){
    // Collect recent & pinned for each category
    const recentByCat=(catId)=>{
      const catPosts=posts.filter(p=>p.cat===catId);
      const pinned=catPosts.filter(p=>p.pinned);
      const rest=catPosts.filter(p=>!p.pinned).sort((a,b)=>(b.ts?.getTime?.()||0)-(a.ts?.getTime?.()||0));
      return [...pinned,...rest].slice(0,3);
    };
    return(
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?12:20}}>
          {/* Welcome banner */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:mob?12:16,padding:"0 2px"}}>
            <div style={{fontSize:mob?15:17,fontWeight:700,color:T.txH}}>2026年度 新入生掲示板</div>
            <div style={{fontSize:11,color:T.txD}}>- 先輩や同期と情報交換</div>
          </div>

          {/* Category cards */}
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:mob?10:14,marginBottom:mob?14:20}}>
            {CATEGORIES.map(c=>{
              const count=catCounts[c.id]||0;
              return(
                <div key={c.id} onClick={()=>setCat(c.id)}
                  style={{borderRadius:14,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",overflow:"hidden",transition:"transform .12s, box-shadow .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 4px 16px ${c.color}15`;}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                  {/* Color bar */}
                  <div style={{height:4,background:`linear-gradient(90deg, ${c.color}, ${c.color}88)`}}/>
                  <div style={{padding:mob?"14px 14px 12px":"18px 18px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{width:36,height:36,borderRadius:10,background:`${c.color}14`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
                        <span style={{color:c.color,display:"flex"}}>{c.icon}</span>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14,color:T.txH}}>{c.label}</div>
                        <div style={{fontSize:11,color:T.txD,marginTop:1}}>{count}件のスレッド</div>
                      </div>
                      <span style={{color:T.txD,display:"flex"}}>{I.arr}</span>
                    </div>
                    <div style={{fontSize:12,color:T.txD,lineHeight:1.5}}>{c.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent threads per category */}
          {CATEGORIES.map(c=>{
            const recent=recentByCat(c.id);
            if(!recent.length) return null;
            return(
              <div key={c.id} style={{marginBottom:mob?16:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,padding:"0 2px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:4,height:16,borderRadius:2,background:c.color}}/>
                    <span style={{fontWeight:700,fontSize:14,color:T.txH}}>{c.label}</span>
                    <span style={{fontSize:11,color:T.txD}}>の最新スレッド</span>
                  </div>
                  <div onClick={()=>setCat(c.id)} style={{fontSize:12,color:T.accent,cursor:"pointer",fontWeight:500,display:"flex",alignItems:"center",gap:2}}>
                    すべて見る<span style={{display:"flex"}}>{I.arr}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {recent.map(p=>{
                    const liked=p.likes.includes(userId);
                    const firstLine=p.text.split("\n")[0].replace(/^\*\*(.+)\*\*$/,"$1").slice(0,60);
                    return(
                      <div key={p.id} onClick={()=>setOpenPost(p.id)}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg2,cursor:"pointer",transition:"background .1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background=T.bg2}>
                        {/* Left color accent */}
                        <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:p.pinned?T.accent:c.color+"60",flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                            {p.pinned&&<span style={{fontSize:10,color:T.accent,fontWeight:600}}>PINNED</span>}
                            {p.type==="question"&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:600}}>Q</span>}
                            <span style={{fontSize:13,fontWeight:600,color:T.txH,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{firstLine}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.txD}}>
                            <span>{p.name}</span>
                            <RoleBadge yr={p.yr}/>
                            <span>·</span>
                            <span>{fT(p.ts)}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,fontSize:11,color:T.txD}}>
                          <span style={{display:"flex",alignItems:"center",gap:2,color:liked?T.red:T.txD}}><span style={{display:"flex",transform:"scale(0.75)"}}>{I.heart}</span>{p.likes.length||""}</span>
                          <span style={{display:"flex",alignItems:"center",gap:2}}><span style={{display:"flex",transform:"scale(0.75)"}}>{I.reply}</span>{p.commentCount||""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Board view (specific category) ──
  const activeCat=CAT_MAP[cat];

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Board header */}
      <div style={{flexShrink:0,borderBottom:`1px solid ${T.bd}`}}>
        {/* Category top bar */}
        <div style={{height:4,background:`linear-gradient(90deg, ${activeCat.color}, ${activeCat.color}66)`}}/>
        <div style={{padding:mob?"12px 14px":"14px 20px",display:"flex",alignItems:"center",gap:10}}>
          <div onClick={()=>{setCat(null);setSearchQ("");}} style={{cursor:"pointer",color:T.txD,display:"flex",padding:4,borderRadius:"50%"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bg3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{I.back}</div>
          <div style={{width:34,height:34,borderRadius:10,background:`${activeCat.color}14`,display:"flex",alignItems:"center",justifyContent:"center",color:activeCat.color}}>{activeCat.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:T.txH}}>{activeCat.label}</div>
            <div style={{fontSize:11,color:T.txD,marginTop:1}}>{activeCat.desc}</div>
          </div>
        </div>

        {/* Category tabs */}
        <div style={{display:"flex",borderTop:`1px solid ${T.bd}`,background:T.bg2}}>
          {CATEGORIES.map(c=>{
            const active=cat===c.id;
            return <div key={c.id} onClick={()=>setCat(c.id)}
              style={{flex:1,textAlign:"center",padding:"9px 0",fontSize:12,fontWeight:active?600:400,color:active?c.color:T.txD,
                borderBottom:`2px solid ${active?c.color:"transparent"}`,cursor:"pointer",transition:"all .12s"}}>
              {c.label}
            </div>;
          })}
        </div>
      </div>

      {/* Search + sort + compose */}
      <div style={{flexShrink:0,padding:mob?"8px 12px":"10px 20px",borderBottom:`1px solid ${T.bd}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,flex:1,minWidth:120,padding:"5px 10px",borderRadius:8,background:T.bg3,border:`1px solid ${T.bd}`}}>
          <span style={{color:T.txD,display:"flex"}}>{I.search}</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder={`${activeCat.label}を検索...`}
            style={{flex:1,border:"none",background:"transparent",color:T.txH,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          {searchQ&&<span onClick={()=>setSearchQ("")} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</span>}
        </div>
        <div style={{display:"flex",gap:2,background:T.bg3,borderRadius:8,padding:2,border:`1px solid ${T.bd}`}}>
          {[{id:"new",l:"新着"},{id:"popular",l:"人気"}].map(s=>(
            <div key={s.id} onClick={()=>setSortBy(s.id)}
              style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:sortBy===s.id?600:400,cursor:"pointer",
                background:sortBy===s.id?T.bg2:"transparent",color:sortBy===s.id?T.txH:T.txD,transition:"all .1s"}}>
              {s.l}
            </div>
          ))}
        </div>
        <div onClick={()=>setComposing(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:8,background:activeCat.color,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
          <span style={{display:"flex"}}>{I.plus}</span>
          <span>投稿</span>
        </div>
      </div>

      {/* Compose modal */}
      {composing&&<>
        <div onClick={()=>setComposing(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:998}}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:mob?"calc(100% - 32px)":480,maxHeight:"80vh",background:T.bg2,border:`1px solid ${T.bd}`,borderRadius:16,zIndex:999,boxShadow:"0 20px 60px rgba(0,0,0,.4)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.bd}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontWeight:700,fontSize:15,color:T.txH}}>新しいスレッド</span>
            <div onClick={()=>{setComposing(false);setTxt("");}} style={{cursor:"pointer",color:T.txD,display:"flex"}}>{I.x}</div>
          </div>
          <div style={{padding:18,flex:1,overflowY:"auto"}}>
            {/* Category selector (when on top page) */}
            {!cat&&<div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:T.txD,marginBottom:6,fontWeight:500}}>カテゴリ</div>
              <div style={{display:"flex",gap:6}}>
                {CATEGORIES.map(c=>(
                  <div key={c.id} onClick={()=>setNewCat(c.id)}
                    style={{flex:1,padding:"8px 6px",borderRadius:8,textAlign:"center",fontSize:12,fontWeight:600,cursor:"pointer",
                      background:newCat===c.id?`${c.color}18`:T.bg3,color:newCat===c.id?c.color:T.txD,
                      border:`1px solid ${newCat===c.id?c.color+"44":T.bd}`,transition:"all .12s"}}>
                    {c.label}
                  </div>
                ))}
              </div>
            </div>}
            <textarea value={txt} onChange={e=>setTxt(e.target.value)} placeholder="質問、情報、体験談を共有しよう..." autoFocus
              style={{width:"100%",minHeight:120,padding:12,borderRadius:10,border:`1px solid ${T.bd}`,background:T.bg3,color:T.txH,fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit",lineHeight:1.6}}/>
          </div>
          <div style={{padding:"12px 18px",borderTop:`1px solid ${T.bd}`,display:"flex",justifyContent:"flex-end",gap:8}}>
            <Btn onClick={()=>{setComposing(false);setTxt("");}}>キャンセル</Btn>
            <Btn on onClick={sendPost} style={{borderRadius:10,opacity:txt.trim()?1:.4,padding:"6px 20px"}}>投稿する</Btn>
          </div>
        </div>
      </>}

      {/* Thread list */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:mob?"8px 12px":"12px 20px"}}>
        {filtered.length===0&&(
          <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>
            {searchQ?"該当するスレッドがありません":"まだスレッドがありません"}
          </div>
        )}
        {filtered.map(p=>{
          const liked=p.likes.includes(userId);
          const lines=p.text.split("\n");
          const title=lines[0].replace(/^\*\*(.+)\*\*$/,"$1").replace(/^#+\s*/,"");
          const preview=lines.slice(1).join("\n").trim().slice(0,100);
          const isPinned=p.pinned;
          const isQ=p.type==="question";
          return(
            <div key={p.id} onClick={()=>setOpenPost(p.id)}
              style={{marginBottom:8,borderRadius:12,border:`1px solid ${isPinned?T.accent+"30":T.bd}`,background:isPinned?`${T.accent}05`:T.bg2,cursor:"pointer",overflow:"hidden",transition:"transform .1s"}}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
              {/* Left color stripe via border */}
              <div style={{display:"flex"}}>
                <div style={{width:4,background:activeCat.color,flexShrink:0,borderRadius:"4px 0 0 4px"}}/>
                <div style={{flex:1,padding:mob?"12px 12px":"14px 16px"}}>
                  {/* Top row: badges */}
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                    {isPinned&&<span style={{fontSize:10,fontWeight:700,color:T.accent,background:`${T.accent}12`,padding:"1px 6px",borderRadius:4}}>PINNED</span>}
                    {isQ&&<span style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"#f59e0b18",padding:"1px 6px",borderRadius:4}}>質問</span>}
                  </div>

                  {/* Title */}
                  <div style={{fontWeight:600,fontSize:mob?14:15,color:T.txH,lineHeight:1.4,marginBottom:preview?4:0}}>{title}</div>

                  {/* Preview */}
                  {preview&&<div style={{fontSize:12,color:T.txD,lineHeight:1.5,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{preview}</div>}

                  {/* Meta row */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <Av u={{name:p.name,col:p.color}} sz={18}/>
                      <span style={{fontSize:11,color:T.txD,fontWeight:500}}>{p.name}</span>
                      <RoleBadge yr={p.yr}/>
                    </div>
                    <span style={{fontSize:11,color:T.txD}}>{fT(p.ts)}</span>
                    <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,fontSize:11,color:T.txD}}>
                      <span onClick={e=>{e.stopPropagation();toggleLike(p.id);}} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",color:liked?T.red:T.txD}}>
                        <span style={{display:"flex",transform:"scale(0.8)"}}>{I.heart}</span>{p.likes.length||""}
                      </span>
                      <span style={{display:"flex",alignItems:"center",gap:3}}>
                        <span style={{display:"flex",transform:"scale(0.8)"}}>{I.reply}</span>{p.commentCount||""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{height:20}}/>
      </div>
    </div>
  );
};
