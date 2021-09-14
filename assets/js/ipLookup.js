function isIP(ip) {
    return (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip));
}

function lookupIP(ip) {

  if(!isIP(ip))
    alert("Please enter a valid IP address first!");

  else {
    toggleLoad(true);

    var serviceList = [
      {
        "title": "AbuseIPDB - Blacklist",
        "url": "https://www.abuseipdb.com/check/"
      },
      {
        "title": "Censys - Scanner",
        "url": "https://censys.io/ipv4/"
      },
      {
        "title": "Cisco Talos - Threat Intelligence",
        "url": "https://talosintelligence.com/reputation_center/lookup?search="
      },
      {
        "title": "Google - Reverse DNS",
        "url": "https://dns.google.com/query?name="
      },
      {
        "title": "GreyNoise - Threat Intelligence",
        "url": "https://www.greynoise.io/viz/riot/"
      },
      {
        "title": "IPInfo - Generic Info",
        "url": "https://ipinfo.io/"
      },
      {
        "title": "IPLocation - GeoIP",
        "url": "https://www.iplocation.net/ip-lookup?query="
      },
      {
        "title": "Open Threat Exchange - Threat Intelligence",
        "url": "https://otx.alienvault.com/indicator/ip/"
      },
      {
        "title": "ScamAlytics - Blacklist",
        "url": "https://scamalytics.com/ip/"
      },
      {
        "title": "SecurityTrails - Passive DNS",
        "url": "https://securitytrails.com/list/ip/"
      },
      {
        "title": "Shodan - Scanner",
        "url": "https://www.shodan.io/host/"
      },
      {
        "title": "ThreatFox - Threat Intelligence",
        "url": "https://threatfox.abuse.ch/browse.php?search=ioc%3A"
      },
      {
        "title": "ThreatMiner - Threat Intelligence",
        "url": "https://www.threatminer.org/host.php?q="
      },
      {
        "title": "VirusTotal - Threat Intelligence",
        "url": "https://www.virustotal.com/gui/ip-address/"
      }
    ]


    $('#ipBar').css("display", "block");

    $('#ipOutput').append("<ul>");
    for (const service of serviceList) {
      $('#ipOutput').append(`<li><a href="${service.url}${ip}" target="_blank">${service.title}</a></li>`);
    }
    $('#ipOutput').append("</ul>");

    toggleLoad(false);
  }
}
