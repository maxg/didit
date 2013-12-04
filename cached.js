var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var path = require('path');

var log = require('./logger').cat('cached');

// static file server that allows client-side caching
exports.static = function(root, options) {
  
  var static = express.static(root, options);
  var hashed = {};
  
  function allowCaching() {
    if (this.statusCode == 200 || this.statusCode == 304) {
      this.setHeader('Cache-Control', 'public, max-age=2592000');
    } else {
      log.info({ req: req, statusCode: this.statusCode }, 'cannot allow caching');
    }
  }
  
  // handle a static content request and allow clients to cache successful responses
  var cached = function(req, res, next) {
    req.url = req.url.substring(req.url.indexOf('/', 1));
    res.on('header', allowCaching);
    return static(req, res, function() {
      // did not handle this request, cannot allow caching
      res.removeListener('header', allowCaching);
      next.apply(this, arguments);
    });
  };
  
  // prepend a cache-busting slug to the given static content URL
  cached.url = function(url) {
    if (hashed.hasOwnProperty(url)) {
      return hashed[url] + url;
    }
    
    var md5 = crypto.createHash('md5');
    md5.update(fs.readFileSync(path.join(root, url)));
    var slug = md5.digest('hex').slice(-8);
    log.info({ url: url, slug: slug }, 'init cached resource');
    
    return (hashed[url] = '/' + slug) + url;
  };
  
  return cached;
};
