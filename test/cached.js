var crypto = require('crypto');
var express = require('express');
var fs = require('fs');
var http = require('http');
var request = require('request');
var should = require('should');
var sinon = require('sinon');

var fixtures = require('./fixtures');

describe('cached', function() {
  
  var cached = require('../cached');
  
  var fix = fixtures();
  var sandbox = sinon.sandbox.create();
  
  beforeEach(function(done) {
    fix.files(this.currentTest, done);
  });
  
  afterEach(function() {
    fix.forget();
    sandbox.restore();
  });
  
  describe('middleware', function() {
    
    var app;
    var server;
    
    beforeEach(function(done) {
      app = express();
      app.use(cached.static(fix.fixdir));
      server = http.createServer(app);
      server.listen(0, done);
    });
    
    afterEach(function(done) {
      server.close(done);
    });
    
    function url() { return 'http://localhost:' + server.address().port; }
    
    it('should allow caching for static files', function(done) {
      request(url() + '/0000000000000000/hello.txt', function(req, res, body) {
        res.statusCode.should.equal(200);
        res.headers['cache-control'].should.equal('public, max-age=2592000');
        body.should.equal('Hello, world!\n');
        done();
      });
    });
    it('should not allow caching for missing files', function(done) {
      request(url() + '/0000000000000000/hello.txt', function(req, res, body) {
        res.statusCode.should.equal(404);
        should.not.exist(res.headers['cache-control']);
        body.should.match(/Cannot GET/);
        done();
      });
    });
    it('should not allow caching on error', function(done) {
      request(url() + '/0000000000000000/../evil.txt', function(req, res, body) {
        res.statusCode.should.equal(403);
        should.not.exist(res.headers['cache-control']);
        body.should.match(/Forbidden/);
        done();
      });
    });
    it('should not allow caching for missing slug', function(done) {
      request(url() + '/hello.txt', function(req, res, body) {
        res.statusCode.should.equal(200);
        res.headers['cache-control'].should.equal('public, max-age=0');
        body.should.equal('Hello, world!\n');
        done();
      });
    });
    it('should not allow caching for unhandled URLs', function(done) {
      app.get('/goodbye.txt', function(req, res) {
        res.end('Goodbye, world!')
      });
      request(url() + '/goodbye.txt', function(req, res, body) {
        res.statusCode.should.equal(200);
        should.not.exist(res.headers['cache-control']);
        body.should.equal('Goodbye, world!');
        done();
      });
    });
  });
  
  describe('url', function() {
    it('should return URL with slug', function() {
      var md5 = crypto.createHash('md5');
      md5.update('Hello, world!\n');
      var slug = md5.digest('hex').slice(-16);
      cached.static(fix.fixdir).url('/hello.txt').should.equal('/' + slug + '/hello.txt');
    });
    it('should cache slugs', function() {
      sandbox.spy(fs, 'readFileSync');
      sandbox.spy(crypto, 'createHash');
      var static = cached.static(fix.fixdir);
      
      var url = static.url('/goodbye.txt');
      fs.readFileSync.calledOnce.should.be.true;
      crypto.createHash.calledOnce.should.be.true;
      
      static.url('/goodbye.txt').should.equal(url);
      fs.readFileSync.calledOnce.should.be.true;
      crypto.createHash.calledOnce.should.be.true;
    });
  });
});
