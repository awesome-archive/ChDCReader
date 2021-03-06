;(function(deps, factory) {
  "use strict";
  if (typeof define === "function" && define.amd)
    define(deps, factory);
  else if (typeof module != "undefined" && typeof module.exports != "undefined")
    module.exports = factory.apply(undefined, deps.map(e => require(e)));
  else
    window["translate_test"] = factory.apply(undefined, deps.map(e => window[e]));
}(["chai", "utils", "translate"], function(chai, utils, translate){

  let assert = chai.assert;
  let equal = assert.equal;


  describe("translate", () => {
    let sc = ["ReLIFE 重返17岁", "依照日期", "依照种类", "依照排名", "漫画新手村", "report167. 不纯的愿动机"];
    let tc = ["ReLIFE 重返17歲", "依照日期", "依照種類", "依照排名", "漫畫新手村","report167. 不純的願動機"];

    it('转换为简体中文', () => {
      equal(undefined, translate.tc2sc());
      sc.forEach((e,i) => equal(e, translate.tc2sc(tc[i])));
    });

    it('转换为繁体中文', () => {
      equal(undefined, translate.sc2tc());
      tc.forEach((e,i) => equal(e, translate.sc2tc(sc[i])));
    });
  });

}));
