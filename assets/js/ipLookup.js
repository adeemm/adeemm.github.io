function isIP(ip) {
    return (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip));
}

function lookupIP(ip) {

  if(!isIP(ip))
    alert("Please enter a valid IP address first!");

  else {
    toggleLoad(true);

    $('#ipOutput').html("");

    var categoryList = [
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
    ]

    $('#ipBar').css("display", "block");

    for (const category of categoryList) {
      $('#ipOutput').append(`<h3 style="margin: 0 0 0.25rem 0">${category.category}</h3>`);

      $('#ipOutput').append($("<ul>").append(category.services.map(service =>
        $("<li>").append(`<a href="${service.url}${ip}" target="_blank">${service.title}</a>`)
      )));
    }

    toggleLoad(false);
  }
}
