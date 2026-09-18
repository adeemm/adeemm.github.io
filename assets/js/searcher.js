var searxInstances = [];
function handleSearxInstances(query) {
    if (searxInstances.length == 0) {
        $.ajax({
            type: "GET",
            url: "https://searx.space/data/instances.json",
            success: function (data, textStatus, jqXHR) {
                for (const [key, value] of Object.entries(data.instances)) {
                    if (value.network_type == "normal" && value.analytics == false) {
                        searxInstances.push(key);
                    }
                }
                openRandomSearx(query);
            },
            error: function (errorMessage) {
                alert(errorMessage.statusText);
            }
        });
    }
    else {
        openRandomSearx(query);
    }
}

function openRandomSearx(query) {
    var randomElement = searxInstances[Math.floor(Math.random() * searxInstances.length)];
    if (randomElement.slice(-1) != "/")
        randomElement += "/";
    window.open((randomElement + `search?q=${query}`), '_blank').focus();
}

function performSlopSearch(searchType, query) {
    if(query.trim() == '')
        alert("Please enter a search query first");

    encodedQuery = encodeURI(query);

    switch(searchType) {
        
        case "ddg":
            window.open(`https://noai.duckduckgo.com/?q=${encodedQuery}&df=2000-01-01..2021-01-01&noai=1&ia=web`, '_blank').focus();
            break;
        case "reddit":
            window.open(`https://cse.google.com/cse?cx=017261104271573007538:bbzhlah6n4o#gsc.tab=0&gsc.q=${encodedQuery}&gsc.sort=`, '_blank').focus();
            break;
        case "searxng":
            handleSearxInstances(encodedQuery);
            break;
        case "stackexch":
            window.open(`https://stackexchange.com/search?q=${encodedQuery}`, '_blank').focus();
            break;
        case "wiki":
            getWiki(query);
            break;
        default:
            break;
    }
}


function getWiki(page) {
    toggleLoad(true);

    $.ajax({
        type: "GET",
        url: "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=" + page + "&callback=?",
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
            blurb.find('a').each(function () { $(this).replaceWith($(this).html()); });

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

            if (redirectCheck == -1) {
                var ambigCheck = markup.indexOf("refer to:");

                if (ambigCheck == -1) {
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
