function getWiki(page) {

  if(page == '')
    alert("Please enter a subject first");

  else {
    $.ajax({
          type: "GET",
          url: "http://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=" + page +  "&callback=?",
          contentType: "application/json; charset=utf-8",
          async: false,
          dataType: "json",
          success: function (data, textStatus, jqXHR) {
              var markup = data.parse.text["*"];

              console.log(markup);

              var blurb = $('<div></div>').html(markup);

              // remove links
              blurb.find('a').each(function() { $(this).replaceWith($(this).html()); });

              // remove references
              blurb.find('sup').remove();

              // remove cite error
              blurb.find('.mw-ext-cite-error').remove();

              var check = markup.indexOf("redirectText");

              if(check == -1)
              {
                document.getElementById('essayBar').style.display = 'block';
                $('#output').html($(blurb).find('p'));
              }

              else {
                var s1 = markup.substring(markup.indexOf("<a"), markup.indexOf("</a></li>"));
                var s2 = s1.slice((s1.indexOf(">") + 1), s1.length);
                getWiki(s2);
              }
          },
          error: function (errorMessage) {
          }
      });
  }
}
