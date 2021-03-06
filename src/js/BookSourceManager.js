;(function(deps, factory) {
  "use strict";
  if (typeof define === "function" && define.amd)
    define(deps, factory);
  else if (typeof module != "undefined" && typeof module.exports != "undefined")
    module.exports = factory.apply(undefined, deps.map(e => require(e)));
  else
    window["BookSourceManager"] = factory.apply(undefined, deps.map(e => window[e]));
}(['co', "utils", "LittleCrawler", "translate", "Book", "BookSource", "Chapter"], function(co, utils, LittleCrawler, translate, Book, BookSource, Chapter) {
  "use strict"

  // **** BookSourceManager *****
  class BookSourceManager{

    constructor(configFileOrConfig, customBookSource){

      this.__sources;
      this.__customBookSource = customBookSource;
      this.__lc = new LittleCrawler();

      this.loadConfig(configFileOrConfig);
      this.addCustomSourceFeature();
    }

    /**
     * 加载配置
     * @param  {[type]} configFileOrConfig [description]
     * @return {[type]}                    [description]
     */
    loadConfig(configFileOrConfig){
      let loadSources = (data) => {
        this.__sources = {};
        data.valid.forEach(key => this.__sources[key] = data.sources[key]);
      }
      if(configFileOrConfig && typeof configFileOrConfig == 'string'){
        return utils.getJSON(configFileOrConfig)
          .then(data => {
            loadSources(data);
            return this.__sources;
          });
      }
      else if(configFileOrConfig){
        loadSources(configFileOrConfig);
      }
      return this.__sources;
    }

    /**
     * 把拦截函数功能添加到类中
     * 可以设置前置拦截器、方法拦截器和后置拦截器
     */
    addCustomSourceFeature(){
      if(!this.__customBookSource) return;
      let customFunctionList = ["getBook", "searchBook",
              "getBookInfo", "getChapterContent",
              "getBookCatalog", "getBookCatalogLink", "getLastestChapter"];

      customFunctionList.forEach(cf => {
        let oldFunction = this[cf];
        let self = this;
        this[cf] = function(bsid){ // 此处必须用 function，不能用箭头函数

          utils.log(`BookSourceManager: Call ${cf} from ${bsid}`);

          // 在调用系统函数之前，用自定义的 before* 函数处理参数
          // 如 beforegetBook 或 beforeGetBook 处理 getBook 函数
          let beforeFunctions = [`before${cf}`, `before${cf[0].toUpperCase()}${cf.slice(1)}`];
          let argsPromise = Promise.resolve(arguments);
          for(let bf of beforeFunctions){
            if(bsid in this.__customBookSource && bf in this.__customBookSource[bsid]){
              argsPromise = this.__customBookSource[bsid][bf].apply(self, arguments);
              break;
            }
          }

          let promise;
          // 优先调用自定义的同名函数，如果 getBook
          if(bsid in this.__customBookSource && cf in this.__customBookSource[bsid])
            promise = argsPromise.then(args => this.__customBookSource[bsid][cf].apply(self, args));

          else
            // 调用系统函数
            promise = argsPromise.then(args => oldFunction.apply(self, args));

          // 在调用完系统函数之后，用自定义的 after* 函数处理结果
          // 如 aftergetBook 或 afterGetBook 处理 getBook 函数
          let afterFunctions = [`after${cf}`, `after${cf[0].toUpperCase()}${cf.slice(1)}`];

          for(let af of afterFunctions){
            if(bsid in this.__customBookSource && af in this.__customBookSource[bsid]){
              return promise.then(result => this.__customBookSource[bsid][af].call(self, result, arguments));
            }
          }
          return promise;
        };
      });

      // init
      return Promise.all(Object.values(this.__customBookSource)
        .map(cm => cm.init && cm.init()));
    }

    /**
     * 通过书名字和目录搜索唯一的书籍
     * @param  {[type]} bsid       [description]
     * @param  {[type]} bookName   [description]
     * @param  {[type]} bookAuthor [description]
     * @return {[type]}            [description]
     */
    getBook(bsid, bookName, bookAuthor){

      if(!bsid || !bookName || !(bsid in this.__sources))
        return Promise.reject(401);

      // 通过当前书名和作者名搜索添加源
      return this.searchBook(bsid, bookName)
        .then(books => {
          const book = books.find(e =>
            e.name == bookName &&
            (!e.author || !bookAuthor || e.author == bookAuthor ));
          return book ? book : Promise.reject(404);
        });
    }


    /**
     * 全局搜索
     * @param  {[type]}  keyword                  [description]
     * @param  {Boolean} options.filterSameResult 过滤不同源中的相同结果
     * @param  {String}  options.bookType         [description]
     * @return {[type]}                           [description]
     */
    searchBookInAllBookSource(keyword, {filterSameResult=true, bookType=""}={}){

      let result = {};
      let successBS = [];
      let failBS = [];
      const errorList = [];
      const allBsids = this.getSourcesKeysByMainSourceWeight();
      const bsids = !bookType ? allBsids : allBsids.filter(e => this.__sources[e].type == bookType);
      const tasks = bsids.map(bsid =>
        // 单书源搜索
        this.searchBook(bsid, keyword)
          .then(books => {
            result[bsid] = books;
            successBS.push(bsid);
          })
          .catch(error => {
            failBS.push(bsid);
            errorList.push(error);
          })
      );

      function handleResult(){
        // 处理结果
        let finalResult = [];

        for(let bsid of bsids){
          let books = result[bsid];
          if(!books)break;
          for(let b of books){
            if(filterSameResult){
              // 过滤相同的结果
              if(!finalResult.find(e => Book.equal(e, b)))
                finalResult.push(b);
            }
            else
              finalResult.push(b);
          }
        }

        if(finalResult.length === 0 && errorList.length > 0)
          throw(utils.findMostError(errorList));


        // 合并结果
        return {
          books: finalResult,
          successBookSources: successBS,
          failBookSources: failBS
        };
      }

      return Promise.all(tasks)
        .then(handleResult);
    }



    /**
     * 从获取的数据中提取 Book
     * @param  {[type]} bs       [description]
     * @param  {[type]} m        [description]
     * @param  {[type]} language [description]
     * @return {[type]}          [description]
     */
    __createBook(bs, m, language){

      m = translate.toSC(language, m, ['name', 'author', 'catagory', 'introduce', "lastestChapter"]);

      m.cover = m.coverImg;

      const book = LittleCrawler.cloneObjectValues(new Book(this), m);
      const bss = LittleCrawler.cloneObjectValues(new BookSource(book, this, bs.id, bs.contentSourceWeight), m);
      book.sources = {}; // 内容来源
      if(bss.lastestChapter)
        bss.lastestChapter = bss.lastestChapter.replace(/^最新更新\s+/, '');  // 最新的章节

      bss.__searched = true;
      book.sources[bs.id] = bss;

      book.mainSourceId = bs.id;  // 主要来源

      return book;

    }

    /**
     * 搜索书籍
     * @param  {[type]} bsid    [description]
     * @param  {[type]} keyword [description]
     * @return {[type]}         [description]
     */
    searchBook(bsid, keyword){

      const self = this;
      const bs = this.__sources[bsid];
      if(!bs) return Promise.reject("Illegal booksource!");

      keyword = translate.fromSC(bs.language, keyword, ['keyword']);

      let dict;
      if(typeof keyword == "object"){
        dict = keyword;
        keyword = dict.keyword;
      }
      else
        dict = {keyword: keyword ? keyword : ""};

      return this.__lc.get(bs.search, dict)
        .then(getBooks);

      function getBooks(data){

        data = data.filter(m => m.name || m.author);

        const books = [];

        for(let m of data){
          m.author = m.author || "";
          if(!checkBook(m))
            continue;
          books.push(self.__createBook(bs, m, bs.language));
        }

        return books;
      }

      function checkBook(book){
        // 筛选搜索结果
        let name = book.name.toLowerCase();
        let author = book.author.toLowerCase();
        let keywords = keyword.toLowerCase().split(/ +/);
        for(let kw of keywords){
          if(kw.includes(name) || name.includes(kw) ||
            (author && kw.includes(author) || author.includes(kw) ))
            return true;
        }
        return false;
      }
    }

    /**
     * 使用详情页链接刷新书籍信息
     * @param  {[type]} bsid [description]
     * @param  {[type]} dict [description]
     * @return {[type]}      [description]
     */
    getBookInfo(bsid, dict){

      const bs = this.__sources[bsid];
      if(!bs) return Promise.reject("Illegal booksource!");

      return this.__lc.get(bs.detail, dict)
        .then(m => {
          m.bookid = dict.bookid;
          m.catalogLink = dict.catalogLink;
          m.detailLink = dict.detailLink;
          let book = this.__createBook(bs, m, bs.language);
          return book;
        });
    }

    /**
     * 获取最新章节
     * @param  {[type]} bsid [description]
     * @param  {[type]} dict [description]
     * @return {[type]}      [description]
     */
    getLastestChapter(bsid, dict){

      const bs = this.__sources[bsid];
      if(!bs) return Promise.reject("Illegal booksource!");

      return this.__lc.get(bs.detail, dict)
        .then(({lastestChapter}) => {
          lastestChapter = translate.toSC(bs.language, lastestChapter);
          return lastestChapter ? lastestChapter.replace(/^最新更新\s+/, '') : lastestChapter;
        });
    }

    /**
     * 从某个网页获取目录链接
     * @param  {[type]} bsid [description]
     * @param  {[type]} dict [description]
     * @return {[type]}      [description]
     */
    getBookCatalogLink(bsid, dict){

      const bs = this.__sources[bsid];
      if(!bs) return Promise.reject("Illegal booksource!");

      if(!bs.catalogLink)
        return Promise.resolve(null);

      return this.__lc.get(bs.catalogLink, dict);
    }


    /**
     * 获取书籍目录
     * @param  {[type]} bsid [description]
     * @param  {[type]} dict [description]
     * @return {[type]}      [description]
     */
    getBookCatalog(bsid, dict){

      const bs = this.__sources[bsid];
      if(!bs) return Promise.reject("Illegal booksource!");

      return this.__lc.get(bs.catalog, dict)
        .then(data => {
          if(bs.catalog.hasVolume)
            data = data
              .map(v => v.chapters.map(c => (c.volume = v.name, c)))
              .reduce((s,e) => s.concat(e), []);
          data = data.map(c => translate.toSC(bs.language, c, ['title']));
          return data.map(c => LittleCrawler.cloneObjectValues(new Chapter(), c));
        });
    }

    /**
     * 从网络上获取章节内容
     * @param  {[type]} bsid [description]
     * @param  {Object} dict [description]
     * @return {[type]}      [description]
     */
    getChapterContent(bsid, dict={}){

      if(!dict.link && !dict.cid) return Promise.reject(206);

      const bs = this.__sources[bsid];
      if(!bs) return Promise.reject("Illegal booksource!");

      return this.__lc.get(bs.chapter, dict)
        .then(({contentHTML: content}) => {
          if(!content.match(/<\/?\w+.*?>/i))// 不是 HTML 文本
            content = LittleCrawler.text2html(content);
          else
            content = LittleCrawler.clearHtml(content);
          content = translate.toSC(bs.language, content);
          return content;
          // if(!content) return Promise.reject(206);

          // const c = new Chapter();
          // c.content = content;
          // c.title = data.title ? data.title : dict.title;
          // c.cid = data.cid ? data.cid : dict.cid;
          // if(!c.cid && dict.link) c.link = dict.link;
          // return c;
        });
    }

    /**
     * 该源的目录是否有卷
     * @param  {[type]}  bsid [description]
     * @return {Boolean}      [description]
     */
    hasVolume(bsid){
      const bs = this.__sources[bsid];
      if(!bs) throw new Error("Illegal booksource!");
      return bs.catalog.hasVolume;
    }

    /**
     * 获取原网页
     * @param  {[type]} bsid [description]
     * @param  {[type]} dict [description]
     * @param  {[type]} key  [description]
     * @return {[type]}      [description]
     */
    getOfficialURLs(bsid, dict, key){

      const bs = this.__sources[bsid];
      if(!bs) throw new Error("Illegal booksource!");

      let config = bs.officialurls;
      if(!config) return null;
      if(key && config[key])
        return LittleCrawler.format(config[key], dict);
      if(!key){
        let result = {};
        for(let key in config)
          result[key] = LittleCrawler.format(config[key], dict);
      }
      return null;
    }

    /**
     * 获取书籍的 DetailLink
     * @param  {[type]} bsid [description]
     * @param  {[type]} dict [description]
     * @return {[type]}      [description]
     */
    getBookDetailLink(bsid, dict){

      const bs = this.__sources[bsid];
      if(!bs) throw new Error("Illegal booksource!");

      return this.__lc.getLink(bs.detail.request, dict);
    }

    /**
     * 获取书籍的章节链接
     * @param  {[type]} bsid [description]
     * @param  {Object} dict [description]
     * @return {[type]}      [description]
     */
    getChapterLink(bsid, dict={}){

      if(!dict.link && !dict.cid) throw new Error(206);

      const bs = this.__sources[bsid];
      if(!bs) throw new Error("Illegal booksource!");

      return this.__lc.getLink(bs.chapter.request, dict);
    }

    /**
     * 按主源权重从大到小排序的数组
     * @param  {[type]} type [description]
     * @return {[type]}      [description]
     */
    getSourcesKeysByMainSourceWeight(type){
      let sources = type != undefined ? this.getBookSourcesByBookType(type) : this.__sources;
      let key = "mainSourceWeight";
      return Object.entries(sources).sort((e1, e2) => - e1[1][key] + e2[1][key]).map(e => e[0]); // 按主源权重从大到小排序的数组
    }

    /**
     * 获取和指定的 bsid 相同 type 的所有 sources
     * @param  {[type]} bsid [description]
     * @return {[type]}      [description]
     */
    getBookSourcesBySameType(bsid){
      if(!bsid || !(bsid in this.__sources)) return null;
      let result = {};
      let type = this.__sources[bsid].type;
      return this.getBookSourcesByBookType(type);
    }

    /**
     * 获取和指定的 booktype 的所有 sources
     * @param  {[type]} type [description]
     * @return {[type]}      [description]
     */
    getBookSourcesByBookType(type){
      if(!type)
        return this.__sources;
      let result = {};
      for(let key in this.__sources){
        if(this.__sources[key].type == type)
          result[key] = this.__sources[key];
      }
      return result;
    }

    /**
     * 获取指定的 booksource
     * @param  {[type]} bsid [description]
     * @return {[type]}      [description]
     */
    getBookSource(bsid){
      try{
        return this.__sources[bsid];
      }
      catch(e){
        return {};
      }
    }

    /**
     * 获取内容源的类型
     * @param  {[type]} bsid [description]
     * @return {[type]}      [description]
     */
    getBookSourceTypeName(bsid){
      try{
        let typeName = {
          "comics": "漫画",
          "novel": "小说"
        };
        return typeName[this.__sources[bsid].type];
      }
      catch(e){
        return "";
      }
    }

    /**
     * 获取内容源的类型
     * @param  {[type]} bsid [description]
     * @return {[type]}      [description]
     */
    getBookSourceType(bsid){
      try{
        return this.__sources[bsid].type;
      }
      catch(e){
        return null;
      }
    }

  }

  return BookSourceManager;
}));
