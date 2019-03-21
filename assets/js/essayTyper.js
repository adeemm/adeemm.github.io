function getWiki(page) {

  if(page == '')
    alert("Please enter a subject first");

  else {
    $.ajax({
          type: "GET",
          url: "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=" + page +  "&callback=?",
          contentType: "application/json; charset=utf-8",
          async: false,
          dataType: "json",
          success: function (data, textStatus, jqXHR) {
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
              document.getElementById('essayAmbig').style.display = 'none';
              document.getElementById('essayError').style.display = 'none';
              document.getElementById('essayBar').style.display = 'block';

              var redirectCheck = markup.indexOf("redirectText");

              if(redirectCheck == -1){
                var ambigCheck = markup.indexOf("refer to:");

                if(ambigCheck == -1) {
                  $('#output').html($(blurb).find('p'));
                }

                else {
                  document.getElementById('essayAmbig').style.display = 'block';

                  blurb.find('div').remove('.toc');

                  blurb.find('p').remove();

                  blurb.find('span').remove('.mw-editsection');

                  console.log(blurb);

                  $('#output').html(blurb);
                }
              }

              else {
                var s1 = markup.substring(markup.indexOf("<a"), markup.indexOf("</a></li>"));
                var s2 = s1.slice((s1.indexOf(">") + 1), s1.length);
                getWiki(s2);
              }
          },
          error: function (errorMessage) {
            document.getElementById('essayError').style.display = 'block';
            document.getElementById('essayError').innerHTML = errorMessage;
          }
      });
  }
}
