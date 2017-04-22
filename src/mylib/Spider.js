define(["util"], function(util){
  /******* 格式说明 ************

    request 设置请求
    * url: 请求的 URL
    * method: 请求方法，缺省为 GET
    * params: 请求参数
    * type: 响应类型，可为 JSON 或 HTML，缺省为 HTML
    * cookies:
    request 也可为单一字符串，只指定 url，
    若 request 缺省，则在 dict 的 url 属性中读取 url

    response 设置响应对象
    * 可以为三种 JSON 类型
      * array 返回对象为数组
      * object 返回对象为 list 数组或者 object
        * 如果有 type 属性，则 type 取值可为
          * array
          * string
          * boolean
          * format: 从当前已经获取的结果中合成该结果
          * 缺省为 object
      * string 返回对象为字符串

    * 特殊属性说明：
      * 以 Link 结尾的会自动获取 a 标签的 href 属性值
      * 以 Img 或 Image 结尾的会自动获取 img 标签的 src 属性值


  ****************************/

  /******* 例子 ***************

  {
    "request": {
      "url": "http://se.qidian.com/?kw={keyword}",
      "method": "GET",
      "params": "",
      "type": "html",
      "timeout": 15
    },
    "response": {
      "type": "array",
      "element": "#result-list li[data-rid]",
      "children": {
          "author": ".book-mid-info .author>a.name",
          "catagory": ".book-mid-info .author a:nth-child(4)",
          "complete": ".book-mid-info .author span:last-child",
          "coverImg": ".book-img-box img",
          "introduce": ".book-mid-info .intro",
          "lastestChapter": ".book-mid-info .update>a",
          "detailLink": {
            "type": "string",
            "element": ".book-mid-info>h4>a",
            "attribute": "href"
          },
          "name": ".book-mid-info>h4>a"
        }
    }
  }

  *****************************/

  class Spider{

    constructor(){

    }


    // 从配置对象中抓取并获得结果
    get({request, response}={}, dict={}){
      if(!response)
        return Promise.reject(new Error("Empty response"));

      if(!request)
        request = {
          "url": dict.url
        };

      if(util.type(request) == "string"){
        request = {
          "url": request
        };
      }

      if(!request.url)
        return Promise.reject(new Error("Empty URL"));

      // 补充缺省值
      let method = (request.method || "GET").toLowerCase();
      let type = (request.type || "HTML").toLowerCase();

      // 获取 URL
      let url = this.format(request.url, dict);
      dict.host = url; // 用于修复获取到的 URL

      let requestPromise;

      switch(method){
        case "post":
          // TODO: POST
          break;
        case "get":
          requestPromise = util.get(url, request.params, null,
                  {timeout: request.timeout});
          break;
        default:
          throw new Error("Illegal type");
      }

      switch(type){
        case "html":
          return requestPromise
            .then(data => {
              data = this.filterHtmlContent(data);
              data = this.__transformHTMLTagProperty(data);
              let html = document.createElement("div");
              html.innerHTML = data;

              return this.__handleResponse(html, response, null,  dict);
            });
        case "json":
          return requestPromise.then(data => {
            let json = JSON.parse(data);
            return this.__handleResponse(json, response, null, dict);
          });
        default:
          throw new Error("Illegal type");
      }
    }

    // 处理响应
    __handleResponse(data, response, keyName, globalDict={}, dict={}){

      if(!response) return undefined;

      switch(util.type(response)){
        case "array":
          return this.__handleArray(data, response, keyName, globalDict, dict);
        case "object":
          return this.__handleObject(data, response, keyName, globalDict, dict);
        case "string":
          return this.__handleString(data, response, keyName, globalDict, dict);
        default:
          throw new Error("Illegal type");
      }
    }

    __handleArray(data, response, keyName, globalDict={}, dict={}){
      let result = [];
      for(let m of response){
        result.push(this.__handleResponse(data, m, keyName, globalDict, dict));
      }
      return result;
    }

    // 处理 object
    __handleObject(data, response, keyName, globalDict={}, dict={}){

      const __privateHandleObject = (response) => {
        // object 类型
        let result = {};
        // let delay = [];
        for(let key in response){
          // TODO: 把 format 类型和带有 valid 验证功能的最后处理
          result[key] = this.__handleResponse(data, response[key], key, globalDict, result);
        }
        return result;
      }

      if(!response.type){
        // object 类型，直接解析成员
        return __privateHandleObject(response);
      }

      let result;

      let type = response.type.toLowerCase();

      switch(type){

        case "array": {
          // array
          if(!response.element || !response.children)
            return undefined;
          result = [];
          let list = this.__getAllElements(data, response.element);
          result = list.map(m =>
              this.__handleResponse(m, response.children, keyName, globalDict, dict));
          if(response.valideach)
            result = result.filter(m => {
              // 有验证的类型
              let gatherDict = Object.assign({}, globalDict, util.type(m) == "object" ? m : {});
              const validCode = '"use strict"\n' + this.format(response.valideach, gatherDict, true);
              return eval(validCode);
            });
        }
        break;
        case "object": {
          if(!response.children)
            return undefined;
          result = __privateHandleObject(response.children);
        }
        break;
        case "string": {
          if(!response.element)
            return undefined;

          let e = this.__getElement(data, response.element);
          if(!e) return undefined;
          if(response.attribute){
            let attr;
            if(response.attribute == 'src')
              attr = 'data-src';
            else
              attr = response.attribute;
            result = e.getAttribute(attr);
            if(attr == 'innerHTML')
              result = result.replace(/\bdata-src=(?=["'])/gi, "src=");
          }
          else
            result = this.__getValue(e, keyName, globalDict, dict);

          if(!result) return result;
          // 用 remove 键指定删除一些值
          if(response.remove){
            let regex = new RegExp(response.remove, 'gi');
            result = result.replace(regex, '');
          }

          // 使用 extract 提取最终结果
          if(response.extract){
            let regex = new RegExp(response.extract, 'i'); // 只匹配地址一个结果
            let matcher = result.match(regex);
            if(!matcher) return undefined;
            result = matcher[1];
          }
        }
        break;
        case "boolean": {
          if(!response.element)
            return response.default;
          let e = this.__getElement(data, response.element);
          if(!e) return response.default;
          let v = this.__getValue(e, keyName, globalDict, dict);

          if(v && response.true && v.match(response.true))
            result = true;
          else if(v && response.false && v.match(response.false))
            result = false;
          else
            result = response.default;
        }
        break;
        case "format": {
          // 合成结果
          if(!response.value)
            return undefined;
          let gatherDict = Object.assign({}, globalDict, dict);
          result = this.format(response.value, gatherDict);
        }
        break;
        default: {
          // 把 type 当前普通值对待
          result = __privateHandleObject(response);
        }
      }

      if("valid" in response){
        // 有验证的类型
        let gatherDict = Object.assign({}, globalDict, dict);
        const validCode = '"use strict"\n' + this.format(response.valid, gatherDict, true);
        if(!eval(validCode))
          return undefined; // 验证失败，返回空值
      }
      return result;
    }

    __handleString(data, response, keyName, globalDict={}, dict={}){
      let e = this.__getElement(data, response);
      if(!e) return undefined;
      return this.__getValue(e, keyName, globalDict, dict);
    }

    // 获取值
    __getValue(element, keyName, globalDict={}, dict={}){
      if(util.type(element) == 'object' && "querySelector" in element){
        if(!keyName)
          return element.textContent;
        else if(keyName.match(/link$/i))
          return this.fixurl(element.getAttribute("href"), globalDict.host);
        else if(keyName.match(/img$|image$/i))
          return this.fixurl(element.getAttribute("data-src"), globalDict.host);
        else if(keyName.match(/html$/i))
          return element.innerHTML.replace(/\bdata-src=(?=["'])/gi, "src=");
        else
          return element.textContent.trim();
      }
      else{
        // json
        return element;
      }
    }

    // 获取 HTML 元素对象
    __getElement(element, selector){
      if(!element || !selector) return undefined;

      if("querySelector" in element){
        // html
        return element.querySelector(selector);
      }
      else{
        // json
        return this.__getDataFromObject(element, selector);
      }
    }

    // 获取所有匹配值
    __getAllElements(element, selector){
      if(!element || !selector) return undefined;

      if("querySelectorAll" in element){
        return Array.from(element.querySelectorAll(selector));
      }
      else{
        return this.__getDataFromObject(element, selector) || [];
      }
    }

    // 从 Object 中获取数据
    __getDataFromObject(obj, key){

      function operatorFilter(element, args){
        let codeStart = '"use strict"\n';
        let env = `var $element=${JSON.stringify(element)};\n`;
        let code = codeStart + env + args[0];
        return eval(code);
      }

      function splitKeyAndOperatorAndArgs(operatorAndArgs){
        if(!operatorAndArgs) return [];
        let i = operatorAndArgs.indexOf('#');
        if(i < 0)
          return [operatorAndArgs];
        let key = operatorAndArgs.substring(0, i);
        operatorAndArgs = operatorAndArgs.substring(i+1);

        i = operatorAndArgs.indexOf('(');
        if(i < 0)  return [key, operatorAndArgs, undefined];
        let opertaor = operatorAndArgs.substring(0, i);
        let args = operatorAndArgs.substring(i);
        if(args.length > 2)
          args = args.substring(1, args.length - 1).split('#').map(e => JSON.parse(e));
        else
          args = [];
        return [key, opertaor, args];
      }

      if(!obj || !key) return obj;
      const keys = key.split('::');
      let result = obj;
      for(let key of keys){
        let [k, operator, args] = splitKeyAndOperatorAndArgs(key);

        if(!result) return undefined;

        if(util.type(result) == 'array'){
          // 多个值的情况
          if(operator == 'concat')
            result = result.reduce((s, m) => s.concat(m[k]), []);
          else if(operator == "filter")
            result = result.map(m => m[k])
              .filter(e => operatorFilter(e, args));
          else
            result = result.map(m => m[k]);
        }
        else{
          // 单个值的情况
          if(operator == "filter"){
            result = result[k];
            if(util.type(result) == 'array')
              result = result.filter(e => operatorFilter(e, args));
          }
          else
            result = result[k];
        }
      }
      return result
    }


    // 修复抓取的 URL
    fixurl(url, host){
      if(!url || url.match("^https?://"))
        return url;

      if(url.match("^//"))
        url = "http:" + url;
      else if(url.match("^://"))
        url = "http" + url;
      else if(url.match("^javascript:"))
        url = "";
      else {

        // 需要用到 host 了
        let matcher = host.match(/^(.*):\/\//);
        let scheme = matcher ? matcher[0] : "";
        host = host.substring(scheme.length);

        if(url.match("^/")){
          host = host.replace(/\/.*$/, ""); // 去掉第一个 / 后面的内容
          url = `${scheme}${host}${url}`;
        }
        else{
          // host = host.replace(/\?.*$/, ""); // 去掉?后面的内容
          host = host.replace(/\/[^\/]*$/, "") // 去掉最后一个 / 后面的内容
          let m2 = url.match(/^\.\.\//g);
          url = url.replace(/^\.\.\//g, '');
          if(m2){
            for(let i = 0; i < m2.length; i++)
              host = host.replace(/\/[^\/]*$/, "") // 去掉最后一个 / 后面的内容
          }
          url = `${scheme}${host}/${url}`;

        }
      }
      return url;
    }

    // 字符串格式化，类似于 Python 的 string.format
    // stringify 为 true 表示将属性先 stringify 在放入
    format(string, object={}, stringify=false){
      if(!string) return string;

      const result = string.replace(/{(\w+)}/g, (p0, p1) =>
          p1 in object ? ( stringify ? JSON.stringify(object[p1]) : object[p1]) : `{${p1}}`
        )
      return result;
    }

    // 将复杂的 HTML 内容转换成只有文字和图片的简单的内容
    clearHtml(html){
      if(!html) return html;

      // 清除黑名单标签
      html = this.filterHtmlContent(html);

      // 清空标签属性，排除白名单属性 src
      let whitePropertyList = ['src'];
      html = html.replace(/[\s\r\n]*([\w-]+)[\s\r\n]*=[\s\r\n]*"[^"]*"/gi, (p0, p1)=>
          whitePropertyList.includes(p1) ? p0 : ""
        );

      // 转换 <br> 为 p 标签
      if(html.match(/<br\s*\/?>/gi)){
        // 替换双 br
        let dbrhtml = html.replace(/([^>]*)<br\s*\/?>\s*<br\s*\/?>/gi, '<p>$1</pchange>');
        if(dbrhtml.match(/<br\s*\/?>\s*/i))
          html = html.replace(/([^>]*)<br\s*\/?>/gi, '<p>$1</pchange>');
        else
          html = dbrhtml;
        // 转换了 br
        // 转换最后一行
        html = html.replace(/<\/pchange>([^<]+)($|<)/gi, '</p><p>$1</p>$2');
        html = html.replace(/<\/pchange>/gi, '</p>');
      }

      // 去掉标签前后的空格 &nbsp;
      html = html.replace(/>(　|\s|&nbsp;)+/gi, '>');
      html = html.replace(/(　|\s|&nbsp;)+</gi, '<');

      return html;
    }

    // 过滤 HTML 中的内容，用于爬虫
    filterHtmlContent(html){
      if(!html) return html;

      // 只要 body
      const m = html.match(/<body(?: [^>]*?)?>([\s\S]*?)<\/body>/);
      if(m && m.length >= 2)
        html = m[1];

      let blackList = ['script', 'style', 'link', 'meta', 'iframe'];
      html = blackList.reduce((html, be) => this.__filterElement(html, be), html);
      return html;
    }

    // 将诸如 img 标签的 src 属性转换为 data-src 防止浏览器加载图片
    __transformHTMLTagProperty(html){
      if(!html) return html;

      // 图片的 src 属性转换成 data-src 属性
      html = html.replace(/\bsrc=(?=["'])/gi, "data-src=");
      return html;
    }

    // 过滤某些标签
    __filterElement(html, element, endElement=element){

      if(!html || !element) return html;

      let pattern = `<${element}( [^>]*?)?>[\\s\\S]*?</${endElement}>`;
      html = html.replace(new RegExp(pattern, 'gi'), '');
      // 去除单标签
      pattern = `<${element}([^>]*?)?>`;
      html = html.replace(new RegExp(pattern, 'gi'), '');
      return html;
    }

  }

  return Spider;
});
