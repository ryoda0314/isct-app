import { T } from '../theme.js';
import { Tag, Tx } from '../shared.jsx';

export const BookmarkView=({bmarks,mob,setView,setCid,setCh,courses=[]})=>{
  // Bookmarks will be Supabase-backed in future
  return(
    <div style={{flex:1,overflowY:"auto",padding:12}}>
      <div style={{fontWeight:700,color:T.txH,fontSize:14,marginBottom:10}}>ブックマーク (0)</div>
      <div style={{textAlign:"center",padding:40,color:T.txD,fontSize:13}}>まだブックマークがありません</div>
    </div>
  );
};
