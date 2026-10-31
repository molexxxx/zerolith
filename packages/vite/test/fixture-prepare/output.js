import { prepared as __zl_prepared } from "zerolith/internal";import { html as h, render } from "zerolith";
import * as z from "zerolith";
import { other } from "./other.js";

const __zl_t0 = __zl_prepared(["<li class=\"row ","\" ?selected="," @click="," .value=",">","</li>"], "<li zl$0 zl$1 zl$2 zl$3><!--zl$--></li>", [[1,"class",["row ",""]],[2,"selected",["",""]],[4,"click",["",""]],[3,"value",["",""]],[0,"",[]]]);const __zl_t1 = __zl_prepared(["\n    <ul title='list' data-count=",">\n        ","\n        <li class=\"empty ","\">"," ","</li>\n    </ul>\n"], "\n    <ul title='list' zl$0>\n        <!--zl$-->\n        <li zl$2><!--zl$--> <!--zl$--></li>\n    </ul>\n", [[1,"data-count",["",""]],[0,"",[]],[1,"class",["empty ",""]],[0,"",[]],[0,"",[]]]);const __zl_t2 = __zl_prepared(["<em>yet</em>"], "<em>yet</em>", []);const __zl_v2 = h(__zl_t2);export function Row(item, onPick)
{
    return h(__zl_t0, item.kind, item.selected, onPick, item.id, item.label);
}

export const List = (items) => z.html(__zl_t1,
 items.length,
 items.map((item) => Row(item, other)),
 items.length === 0 ? "shown" : "", "nothing", (__zl_v2)

);

render(List([]), "#app");
