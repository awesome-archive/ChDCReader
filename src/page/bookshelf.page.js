"use strict"
define(["jquery", "main", "Page", "util", "uiutil", 'Chapter', 'sortablejs'], function($, app, Page, util, uiutil, Chapter, sortablejs){

  class MyPage extends Page{
    onLoad(params){
      this.loadView();
    }

    onResume(){
      if(app.bookShelf.loaded){
        this.loadBooks(".bookshelf", app.bookShelf);
      }
      else{
        app.bookShelf.load(app.bookSourceManager)
          .then(() => this.loadBooks(".bookshelf", app.bookShelf));
      }
    }

    onDeviceResume(){
      this.onResume();
    }

    isReadingLastestChapter(lastestChapter, readingRecord){
      return Chapter.equalTitle2(lastestChapter, readingRecord.chapterTitle);
    }

    removeBook(event){
      const target = $(event.currentTarget);
      const i = target.data('book-index');
      app.bookShelf.removeBook(i);
      app.bookShelf.save()
        .then(() => {
          uiutil.showMessage("删除成功！");
          this.loadBooks(".bookshelf", app.bookShelf);
        })
        .catch(error => {
          uiutil.showError("删除失败！");
          this.loadBooks(".bookshelf", app.bookShelf);
        });
      return false;
    }

    // 加载书架列表
    loadBooks(id, bookShelf){
      const books = bookShelf.books;
      const bs = $(id);
      bs.empty();
      const b = $(".template .book");

      books.forEach((value, i) => {
        const readingRecord = value.readingRecord;
        const book = value.book;

        const nb = b.clone();
        if(book.cover)
          nb.find(".book-cover").attr("src", book.cover);
        nb.find(".book-name").text(book.name);
        if(app.bookSourceManager.getBookSourceType(book.mainSourceId) == 'comics')
          nb.find(".book-name").addClass('type-comics');
        nb.find(".book-readingchapter").text('读到：' + readingRecord.chapterTitle);

        // 刷新最新章节
        book.getLastestChapter()
          .then(([lastestChapter]) => {
            nb.find(".book-lastestchapter")
              .text("最新：" + (lastestChapter? lastestChapter : "无"))
              .addClass(this.isReadingLastestChapter(lastestChapter, readingRecord) ? "" : 'unread-chapter');

            // 缓存后面章节内容
            book.cacheChapter(readingRecord.chapterIndex + 1, app.settings.settings.cacheChapterCount);
          });

        nb.find('.book-cover, .book-info')
          .click(() => app.page.showPage("readbook", {book: value.book, readingRecord: value.readingRecord}));

        nb.find('.btnBookMenu').click(event => {
          $(event.currentTarget).dropdown();
          return false;
        }).dropdown();

        nb.data('book-index', i);

        nb.find('.btnRemoveBook').click(this.removeBook.bind(this)).data('book-index', i);
        bs.append(nb);
      });
    };

    // 重新给所有书籍排序
    sortBooksByElementOrde(){
      const newBooks = [];
      const elements = $(".bookshelf").children();
      const length = elements.length;

      for(let i = 0; i < length; i++){
        newBooks[i] = app.bookShelf.books[$(elements[i]).data('book-index')];
      }
      if(newBooks.length == app.bookShelf.books.length)
        app.bookShelf.books = newBooks;
    }

    loadView(){
      sortablejs.create($(".bookshelf")[0],
              {
                handle: ".btnBookMenu",
                animation: 150,
                // Changed sorting within list
                onUpdate: (event) => {
                  // 更新并保存顺序
                  this.sortBooksByElementOrde();
                },
              });
      $("#btnCheckUpdate").click(e => app.chekcUpdate(true, true));
      $(".btnSearch").click(e => app.page.showPage("search"));
      $(".btnExplore").click(e => app.page.showPage("explorebook"));

    }

  }

  return MyPage;
});

