function getWiki(page) {

  if(page == '')
    alert("Please enter a subject first");

  else {
    toggleLoad(true);

    $.ajax({
          type: "GET",
          url: "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=" + page +  "&callback=?",
          contentType: "application/json; charset=utf-8",
          dataType: "json",
          success: function (data, textStatus, jqXHR) {
              if (data.error) {
                this.error("Error typing essay! Try another topic");
                return;
              }

              var markup = data.parse.text["*"];
              var blurb = $('<div></div>').html(markup);

              // remove links
              blurb.find('a').each(function() { $(this).replaceWith($(this).html()); });

              // remove references
              blurb.find('sup').remove();

              //remove infobox
              blurb.find('table').remove();

              // remove cite error
              blurb.find('.mw-ext-cite-error').remove();

              $('#output').html("");
              $('#essayAmbig').css("display", "none");
              $('#essayError').css("display", "none");
              $('#essayBar').css("display", "block");

              var redirectCheck = markup.indexOf("redirectText");

              if(redirectCheck == -1) {
                var ambigCheck = markup.indexOf("refer to:");

                if(ambigCheck == -1) {
                  $('#output').html($(blurb).find('p'));
                }

                else {
                  $('#essayAmbig').css("display", "block");

                  blurb.find('div').remove('.toc');

                  blurb.find('p').remove();

                  blurb.find('span').remove('.mw-editsection');

                  $('#output').html(blurb);
                }
              }

              else {
                var s1 = markup.substring(markup.indexOf("<a"), markup.indexOf("</a></li>"));
                var s2 = s1.slice((s1.indexOf(">") + 1), s1.length);
                getWiki(s2);
              }

              toggleLoad(false);
          },
          error: function (errorMessage) {
            $('#output').html("");
            $('#essayBar').css("display", "block");
            $('#essayError').css("display", "block");
            $('#essayError').html(errorMessage);
            toggleLoad(false);
          }
      });
  }
}
