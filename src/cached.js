const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

const log = require('./logger').cat('cached');

const length = 16;
const sluggish = new RegExp('^/[0-9a-f]{' + length + '}');

// static file server that allows client-side caching
exports.static = function(root, options) {
  
  let static = express.static(root, options);
  let hashed = {};
  
  function allowCaching() {
    if (this.statusCode == 200 || this.statusCode == 304) {
      this.setHeader('Cache-Control', 'public, max-age=2592000');
    } else {
      log.info({ req: this.req, statusCode: this.statusCode }, 'cannot allow caching');
    }
  }
  
  // handle a static content request and allow clients to cache successful responses
  let cached = function(req, res, next) {
    req.url = req.url.replace(sluggish, function() {
      // remove slug, allow caching
      res.writeHeadOriginal = res.writeHead;
      res.writeHead = function() {
        allowCaching.apply(this);
        res.writeHeadOriginal.apply(this, arguments);
      };
      return '';
    });
    return static(req, res, function() {
      // did not handle this request, cannot allow caching
      res.writeHead = res.writeHeadOriginal || res.writeHead;
      next.apply(this, arguments);
    });
  };
  
  // prepend a cache-busting slug to the given static content URL
  cached.url = function(url) {
    if (hashed.hasOwnProperty(url)) {
      return hashed[url] + url;
    }
    
    let md5 = crypto.createHash('md5');
    md5.update(fs.readFileSync(path.join(root, url)));
    let slug = md5.digest('hex').slice(-length);
    log.info({ url, slug }, 'init cached resource');
    
    return (hashed[url] = '/' + slug) + url;
  };
  
  return cached;
};
