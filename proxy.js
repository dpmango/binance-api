const optionDefinitions = [
  { name: "port", alias: "p", type: Number, defaultValue: 8200 },
  { name: "target", alias: "t", type: String, defaultValue: "https://api.binance.com/" },
];
commandLineArgs = require("command-line-args");

const options = commandLineArgs(optionDefinitions);

// Start the proxy
console.log("Start proxy on port", options.port, "for", options.target);
var http = require("http"),
  httpProxy = require("http-proxy");

// Create a proxy server with custom application logic
var proxy = httpProxy.createProxyServer({});
var sendError = function (res, err) {
  return res.status(500).send({
    error: err,
    message: "An error occured in the proxy",
  });
};

// error handling
proxy.on("error", function (err, req, res) {
  sendError(res, err);
});

var enableCors = function (req, res) {
  if (req.headers["access-control-request-method"]) {
    res.setHeader("access-control-allow-methods", req.headers["access-control-request-method"]);
  }

  if (req.headers["access-control-request-headers"]) {
    res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"]);
  }

  if (req.headers.origin) {
    res.setHeader("access-control-allow-origin", req.headers.origin);
    res.setHeader("access-control-allow-credentials", "true");
  }
};

// set header for CORS
proxy.on("proxyRes", function (proxyRes, req, res) {
  enableCors(req, res);
});

var server = http.createServer(function (req, res) {
  if (req.method === "OPTIONS") {
    enableCors(req, res);
    res.writeHead(200);
    res.end();
    return;
  }

  proxy.web(
    req,
    res,
    {
      target: options.target,
      secure: true,
      changeOrigin: true,
    },
    function (err) {
      sendError(res, err);
    }
  );
});

server.listen(options.port);
