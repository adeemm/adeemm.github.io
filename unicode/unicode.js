var aliases = []
var codepointDict = {}

function initializeUnicode() {
	return new Promise((resolve, reject) => {
		$.when(
			$.getJSON("json/PropertyValueAliases.json", function(data) {
				aliases = data.PropertyValueAliases;
			}),
			$.getJSON("json/CodepointDict.json", function(data) {
				codepointDict = data;
			})
		).then(function() {
			resolve();
		});
	})
}

// Generate CodepointDict.json from JSON data files - https://github.com/iLib-js/UCD
// Only needed after Unicode update
function generateCodepointDict() {
    var names = []
    var unicodeData = []

    $.when(
        $.getJSON("json/Blocks.json", function(data) {
            blocks = data.Blocks;
        }),
        $.getJSON("json/NamesList.json", function(data) {
            names = data.NamesList;
        }),
        $.getJSON("json/UnicodeData.json", function(data) {
            unicodeData = data.UnicodeData;
        })
    ).then(function() {
        for (let i = 0; i < unicodeData.length; i++) {
            let codepoint = unicodeData[i].codepoint;
            let nameInfo = names.find(x => x.codepoint === codepoint);
            let blockInfo = blocks.find(x => parseInt(codepoint, 16) >= parseInt(x.range[0], 16) && parseInt(codepoint, 16) <= parseInt(x.range[1], 16));
    
            codepointDict[codepoint] = {
                ...unicodeData[i],
                block: blockInfo ? blockInfo.block : null,
                aliases: nameInfo ? nameInfo.aliases : null,
                comments: nameInfo ? nameInfo.comments : null,
                crossReferences: nameInfo ? nameInfo.crossReferences : null,
                variations: nameInfo ? nameInfo.variations : null
            };
        }

        // Sort by key (codepoint) and save as file
        var blob = new Blob([JSON.stringify(codepointDict)], { type: "application/json" });
        var anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(blob);
        anchor.download = "CodepointDict.json";
        anchor.click();
    });
}

function toggleLoad(shouldShow) {
	$("#loading").toggle(shouldShow);
}

function displayModal(codePointObject) {
    var characterName = codePointObject.name;
    var remarks = codePointObject.block + (codePointObject.comments ? " - " + codePointObject.comments : "");

    var modal = $("<div></div>");
    modal.css({
        "position": "fixed",
        "top": "50%",
        "left": "50%",
        "transform": "translate(-50%, -50%)",
        "background": "black",
        "padding": "20px",
        "border": "1px solid #ddd",
        "border-radius": "10px",
        "box-shadow": "0 0 10px rgba(0, 0, 0, 0.1)",
        "width": "80%",
        "max-height": "90%",
        "overflow": "auto",
        "z-index": "999"
    });

    var modalContent = $("<div></div>");
    modalContent.css({
        "display": "flex",
        "flex-direction": "column"
    });

    var characterNameDiv = $("<div></div>");
    characterNameDiv.css({
        "font-size": "24px",
        "margin-bottom": "10px"
    });
    characterNameDiv.text(characterName);

    var remarksDiv = $("<div></div>");
    remarksDiv.css({
        "font-size": "16px",
        "margin-bottom": "20px"
    });
    remarksDiv.text(remarks);

    var largeCharacter = $("<div id='largeCharacter'></div>");
    largeCharacter.css({
        "font-size": "256px",
        "text-align": "center",
        "margin-bottom": "20px",
        "margin-top": "-6%"
    });
    largeCharacter.text(String.fromCodePoint(parseInt(codePointObject.codepoint, 16)));

    var copyButton = $("<button></button>");
    copyButton.css({
        "margin-bottom": "20px"
    });
    copyButton.text("Copy to Clipboard");

    copyButton.on("click", function() {
        var element = document.getElementById("largeCharacter");
        var range = document.createRange();
        range.selectNodeContents(element);    
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        navigator.clipboard.writeText(String.fromCodePoint(parseInt(codePointObject.codepoint, 16)));
    });

    modalContent.append(characterNameDiv);
    modalContent.append(remarksDiv);
    modalContent.append(largeCharacter);
    modalContent.append(copyButton);
    modal.append(modalContent);

    var closeButton = $("<button></button>");
    closeButton.css({
        position: "absolute",
        top: "10px",
        right: "10px",
    });
    closeButton.text("X");
    closeButton.on("click", function() { modal.remove(); });

    modal.append(closeButton);

    $("body").append(modal);
}