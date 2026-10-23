function isIP(ip) {
    return (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip));
}

// Attempts to interpret the input as a URL or domain name.
// Returns the hostname on success, or null if the input isn't a valid domain.
function getDomain(query) {
    const raw = (query || "").trim();
    if (!raw || /\s/.test(raw)) return null;

    let candidate = raw;
    // If no scheme present assume http so the input can be parsed as a URL.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
        candidate = "http://" + candidate;
    }

    try {
        // Strip a trailing dot from fully-qualified domain names.
        const host = new URL(candidate).hostname.replace(/\.$/, "");

        // Require at least one dot and a TLD of 2+ characters.
        if (!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,}$/i.test(host)) {
            return null;
        }
        return host;
    } catch (e) {
        return null;
    }
}

var ipCategoryList = [
  {
    "category": "Blacklist",
    "services": [
      {
        "title": "AbuseIPDB",
        "url": "https://www.abuseipdb.com/check/"
      },
      {
        "title": "ScamAlytics",
        "url": "https://scamalytics.com/ip/"
      },
      {
        "title": "StopForumSpam",
        "url": "https://www.stopforumspam.com/ipcheck/"
      }
    ]
  },
  {
    "category": "DNS",
    "services": [
      {
        "title": "Google - Reverse DNS",
        "url": "https://dns.google.com/query?name="
      },
      {
        "title": "SecurityTrails - Passive DNS",
        "url": "https://securitytrails.com/list/ip/"
      }
    ]
  },
  {
    "category": "Scanner",
    "services": [
      {
        "title": "Censys",
        "url": "https://censys.io/ipv4/"
      },
      {
        "title": "Shodan",
        "url": "https://www.shodan.io/host/"
      }
    ]
  },
  {
    "category": "Threat Intelligence",
    "services": [
      {
        "title": "Cisco Talos",
        "url": "https://talosintelligence.com/reputation_center/lookup?search="
      },
      {
        "title": "GreyNoise",
        "url": "https://www.greynoise.io/viz/ip/"
      },
      {
        "title": "Open Threat Exchange",
        "url": "https://otx.alienvault.com/indicator/ip/"
      },
      {
        "title": "ThreatFox",
        "url": "https://threatfox.abuse.ch/browse.php?search=ioc%3A"
      },
      {
        "title": "ThreatMiner",
        "url": "https://www.threatminer.org/host.php?q="
      },
      {
        "title": "VirusTotal",
        "url": "https://www.virustotal.com/gui/ip-address/"
      }
    ]
  },
  {
    "category": "Other",
    "services": [
      {
        "title": "IPInfo - Generic Info",
        "url": "https://ipinfo.io/"
      },
      {
        "title": "IPLocation - GeoIP",
        "url": "https://www.iplocation.net/ip-lookup?query="
      }
    ]
  }
];

// Services for URL / domain lookups.
// A "static" service ignores the query and just links to its base page.
var urlCategoryList = [
  {
    "category": "Blacklist",
    "services": [
      {
        "title": "Google Safe Browsing",
        "url": "https://transparencyreport.google.com/safe-browsing/search",
        "static": true
      },
      {
        "title": "PhishTank",
        "url": "https://phishtank.org/index.php",
        "static": true
      },
      {
        "title": "StopForumSpam - Domain",
        "url": "https://www.stopforumspam.com/domain/"
      },
      {
        "title": "URLHaus",
        "url": "https://urlhaus.abuse.ch/browse.php?search="
      },
      {
        "title": "VirusTotal",
        "url": "https://www.virustotal.com/gui/domain/"
      }
    ]
  },
  {
    "category": "Reputation",
    "services": [
      {
        "title": "Spamhaus",
        "url": "https://www.spamhaus.org/domain-reputation?domain="
      }
    ]
  },
  {
    "category": "Scanners",
    "services": [
      {
        "title": "Censys",
        "url": "https://platform.censys.io/search?q="
      },
      {
        "title": "ScanMalware",
        "url": "https://scanmalware.com/search-advanced?q=domain:"
      },
      {
        "title": "Shodan",
        "url": "https://www.shodan.io/domain/"
      },
      {
        "title": "Urlscan.io",
        "url": "https://urlscan.io/search/#"
      }
    ]
  },
  {
    "category": "Threat Intelligence",
    "services": [
      {
        "title": "HudsonRock",
        "url": "https://www.hudsonrock.com/search/domain/"
      },
      {
        "title": "Open Threat Exchange",
        "url": "https://otx.alienvault.com/indicator/domain/"
      },
      {
        "title": "ThreatFox",
        "url": "https://threatfox.abuse.ch/browse.php?search=ioc%3A"
      },
      {
        "title": "ThreatMiner",
        "url": "https://www.threatminer.org/domain.php?q="
      }
    ]
  },
  {
    "category": "Other",
    "services": [
      {
        "title": "Archive.today",
        "url": "https://archive.ph/"
      },
      {
        "title": "crt.sh - Certificate Transparency",
        "url": "https://crt.sh/?q=%25."
      },
      {
        "title": "Google - Indexed Pages",
        "url": "https://www.google.com/search?q=site%3A"
      },
      {
        "title": "Grep.app - Source Code Search",
        "url": "https://grep.app/search?q="
      },
      {
        "title": "RDAP",
        "url": "https://rdap.org/domain/"
      },
      {
        "title": "SecurityTrails - Passive DNS",
        "url": "https://securitytrails.com/list/apex_domain/"
      },
      {
        "title": "Wayback Machine",
        "url": "https://web.archive.org/web/*/http%3A%2F%2F"
      },
      {
        "title": "WHOIS",
        "url": "https://who.is/whois/"
      }
    ]
  },
];

function renderCategories(categoryList, target) {
    $('#ipBar').css("display", "block");

    for (const category of categoryList) {
      $('#ipOutput').append(`<h3 style="margin: 0 0 0.25rem 0">${category.category}</h3>`);

      $('#ipOutput').append($("<ul>").append(category.services.map(service =>
        $("<li>").append(`<a href="${service.static ? service.url : service.url + target}" target="_blank">${service.title}</a>`)
      )));
    }
}

function lookupTarget(query) {
  const raw = (query || "").trim();

  if (!raw) {
    alert("Please enter an IP address or URL first!");
    return;
  }

  let categoryList;
  let target;

  if (isIP(raw)) {
    categoryList = ipCategoryList;
    target = raw;
  } else {
    const domain = getDomain(raw);

    if (!domain) {
      alert("Please enter a valid IP address or URL first!");
      return;
    }

    categoryList = urlCategoryList;
    target = domain;
  }

  toggleLoad(true);

  $('#ipOutput').html("");
  renderCategories(categoryList, target);

  toggleLoad(false);
}
