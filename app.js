var APP = window.APP || {};

// Initializer module
(function (APP) {
  APP.Initilizer = {
    config: {
      rates: {
        interval: null,
        curTime: 0,
        refresh: 30,
      },
      wallet: {
        interval: null,
        curTime: 0,
        refresh: 60,
      },
    },
    init: function () {
      this.rates();
      this.wallet();
      this.forms();
      this.history();
      this.infoButtons();
    },
    rates: function () {
      APP.Binance.getRates();

      const $timer = document.querySelector(".js-course-timer");
      this.createInterval($timer, "rates", () => {
        APP.Binance.getRates();
      });
    },
    wallet: function () {
      APP.Binance.getWallet();
      APP.Binance.getWithdrawHistory();

      const $timer = document.querySelector(".js-accounts-timer");
      this.createInterval($timer, "wallet", () => {
        APP.Binance.getWallet();
        APP.Binance.getWithdrawHistory();
      });
    },
    forms: function () {
      APP.Binance.populateSelects();

      const forms = [
        { selector: ".js-buy-form", func: "sendMarketOrder" },
        { selector: ".js-sell-form", func: "sendMarketOrder" },
        { selector: ".js-withdraw-form", func: "withdrawCoins" },
        { selector: ".js-deposit-form", func: "depositCoins" },
      ];

      forms.forEach((form) => {
        const $formDom = document.querySelector(form.selector);

        $formDom.addEventListener("submit", (e) => {
          e.preventDefault();
          $formDom.querySelector('input[type="text"]').classList.remove("is-invalid");

          if ($formDom.checkValidity()) {
            const formData = new FormData($formDom);
            const formEntries = Object.fromEntries(formData.entries());

            APP.Binance[form.func](formEntries, $formDom);
          }

          $formDom.classList.add("was-validated");
        });
      });
    },
    history: function () {
      const trades = APP.Binance.utils.getLocalStorage("trades");
      const withdraws = APP.Binance.utils.getLocalStorage("withdraws");
      const deposits = APP.Binance.utils.getLocalStorage("deposits");

      trades.forEach((trade) => {
        APP.Binance.fillTradeTables(trade);
      });

      withdraws.forEach((withdraw) => {
        APP.Binance.fillWithdrawTable(withdraw);
      });

      deposits.forEach((depo) => {
        APP.Binance.fillDepositTable(depo);
      });
    },
    infoButtons: function () {
      const $networks = document.querySelectorAll(".js-get-networks");

      $networks.forEach(($btn) => {
        $btn.addEventListener("click", () => {
          APP.Binance.getCoinsInformation();
        });
      });
    },
    createInterval: function ($dom, name, cb) {
      this.config[name].interval = setInterval(() => {
        this.config[name].curTime++;

        if (this.config[name].curTime >= this.config[name].refresh) {
          this.config[name].curTime = 0;
          cb();
        }

        const timeLeft = this.config[name].refresh - this.config[name].curTime;
        $dom.querySelector("span").innerHTML = `${timeLeft}s`;
      }, 1000);

      $dom.addEventListener("click", () => {
        this.config[name].curTime = 0;
        cb();
      });
    },
  };

  document.addEventListener("DOMContentLoaded", function (event) {
    APP.Initilizer.init();
  });
})(window.APP);

// Binance module
(function (APP) {
  APP.Binance = {
    config: {
      // url: "https://api.binance.com/",
      url: "http://176.124.205.45:8200/", // proxy
      keys: {
        api: "API_KEY",
        secret: "SECRET_KEY",
      },
      symbols: ["BTCUSDT", "USDTRUB", "ETHUSDT", "LTCUSDT", "XMRUSDT", "BNBUSDT"],
    },
    data: {
      prevRates: [],
      wallets: [],
    },
    utils: {
      objectToQuery: function (obj) {
        return Object.keys(obj)
          .map((k) => `${k}=${obj[k]}`)
          .join("&");
      },
      dateToTimestamp: function (date) {
        return `${date.getDate()}.${date.getMonth()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
      },
      signMessage: async function (message) {
        const msgUint8_key = new TextEncoder().encode(APP.Binance.config.keys.secret);
        const msgUint8_message = new TextEncoder().encode(message);

        const importedKey = await crypto.subtle.importKey(
          "raw",
          msgUint8_key,
          {
            name: "HMAC",
            hash: "SHA-256",
          },
          true,
          ["sign"]
        );

        const signedKey = await crypto.subtle.sign("HMAC", importedKey, msgUint8_message);
        const hashArray = Array.from(new Uint8Array(signedKey));

        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return hashHex;
      },
      saveLocalStorage: function (data, name) {
        let arr = APP.Binance.utils.getLocalStorage(name);
        arr.push(data);

        localStorage.setItem(name, JSON.stringify(arr));
      },
      setLocalStorage: function (data, name) {
        localStorage.setItem(name, JSON.stringify(data));
      },
      getLocalStorage: function (name) {
        const arr = localStorage.getItem(name);
        if (arr) {
          return JSON.parse(arr);
        } else {
          return [];
        }
      },
      handleFormAfterSubmit: function (status, $form) {
        if (status === true) {
          $form.reset();
          $form.classList.remove("was-validated");
        } else {
          $form.querySelector('input[type="text"]').classList.add("is-invalid");
        }
      },
    },

    sendRequest: async function (url, data, config = {}) {
      let request = {
        method: config.method || "GET",
        headers: config.credentials
          ? {
              "X-MBX-APIKEY": this.config.keys.api,
            }
          : {},
      };

      let urlParams = "";
      let urlObject = data || {};

      if (config.credentials) {
        // const timestamp = await this.sendRequest("api/v3/time").then((res) => res.serverTime);
        // server time is a bit ahead
        const timestamp = Date.now();

        urlObject = {
          ...urlObject,
          timestamp: timestamp,
          recvWindow: 10000,
        };

        const signQuery = this.utils.objectToQuery(urlObject);
        const signature = await this.utils.signMessage(signQuery);

        urlObject = {
          ...urlObject,
          signature: signature,
        };
      }

      if (Object.keys(urlObject).length) {
        urlParams = "?" + this.utils.objectToQuery(urlObject);
      }

      console.log(`${request.method} ${url} || ${urlParams}`);
      return fetch(`${this.config.url}${url}${urlParams}`, request)
        .then(async (response) => {
          if (response.ok) {
            const jsonData = await response.json();
            if (config.log) this.logResponce(jsonData, url);

            return jsonData;
          }
          const err = await response.text();
          throw new Error(err);
        })
        .catch((error) => {
          this.handleError(error, url);
        });
    },
    handleError: function (err, name) {
      console.warn(err);
      this.logResponce(err.message, `ERROR: ${name}`);
    },

    // FETCH METHODS
    getRates: async function () {
      const symbolStr = `%5B${this.config.symbols.map((symbol) => `%22${symbol}%22`).join(",")}%5D`;

      const data = await this.sendRequest(
        "api/v3/ticker/price",
        { symbols: symbolStr },
        { method: "GET", credentials: false }
      );

      if (data) this.renderRates(data);
    },

    getWallet: async function () {
      const data = await this.sendRequest(
        "sapi/v3/asset/getUserAsset",
        // { needBtcValuation: true },
        {},
        { method: "POST", credentials: true }
      );

      if (data) this.renderWallet(data);
    },

    getWithdrawHistory: async function () {
      const data = await this.sendRequest("sapi/v1/capital/withdraw/history", {}, { method: "GET", credentials: true });

      if (data) {
        let withdraws = APP.Binance.utils.getLocalStorage("withdraws");
        withdraws = withdraws.map((w) => {
          const dataWithdraw = data.find((x) => x.id === w.id);

          return dataWithdraw
            ? {
                id: w.id,
                status: dataWithdraw.status,
                info: `${dataWithdraw.amount} ${dataWithdraw.coin}`,
              }
            : w;
        });

        this.utils.setLocalStorage(withdraws, "withdraws");

        // redraw table
        const $tableBody = document.querySelector(".js-withdraw-table tbody");
        $tableBody.innerHTML = "";
        withdraws.forEach((withdraw) => {
          APP.Binance.fillWithdrawTable(withdraw);
        });
      }
    },

    sendMarketOrder: async function (formData, $form) {
      const data = await this.sendRequest(
        "api/v3/order",
        { type: "market", side: formData.side, symbol: formData.pair, quantity: formData.quantity },
        { method: "POST", credentials: true, log: true }
      );

      if (data) {
        this.utils.saveLocalStorage(data, "trades");
        this.fillTradeTables(data);
      }

      this.utils.handleFormAfterSubmit(data ? true : false, $form);
    },

    withdrawCoins: async function (formData, $form) {
      const { coin, network, address, amount } = formData;

      const data = await this.sendRequest(
        "sapi/v1/capital/withdraw/apply",
        { coin, network, address, amount },
        { method: "POST", credentials: true, log: true }
      );

      if (data) {
        this.utils.saveLocalStorage(data, "withdraws");
        this.fillWithdrawTable({ ...data, info: `${amount} ${coin}`, status: "Новый" });
      }
      this.utils.handleFormAfterSubmit(data ? true : false, $form);
    },

    depositCoins: async function (formData, $form) {
      const { coin, network } = formData;

      const data = await this.sendRequest(
        "sapi/v1/capital/deposit/address",
        { coin, network },
        { method: "GET", credentials: true, log: true }
      );

      if (data) {
        this.utils.saveLocalStorage(data, "deposits");
        this.fillDepositTable(data);
      }
      this.utils.handleFormAfterSubmit(data ? true : false, $form);
    },

    getCoinsInformation: async function () {
      const data = await this.sendRequest("sapi/v1/capital/config/getall", {}, { method: "GET", credentials: true });

      const coinsWhiteList = ["USDT", "BTC", "ETH", "LTC", "XMR"];
      const filteredCoins = data.filter((x) => coinsWhiteList.includes(x.coin));

      console.log(filteredCoins);

      filteredCoins.forEach((coin) => {
        const netList = coin.networkList.map((net, idx) => ({
          network: `${net.network} (${net.name})`,
          withdrawFee: net.withdrawFee,
          minMax: `${net.withdrawMin}/${net.withdrawMax}`,
        }));

        this.logResponce(netList, `${coin.name} (${coin.coin})`, true);
      });
    },

    // RENDER FUNCTIONS
    renderRates: function (data) {
      const $rates = document.querySelector(".js-rates");
      let resultHtml = "";

      const rateChange = (rate) => {
        const rates = this.data.prevRates;
        if (rates.length) {
          const prev = rates.find((x) => x.symbol === rate.symbol);
          const prevPrice = +prev.price;
          const curPrice = +rate.price;

          if (prevPrice === curPrice) return null;
          return prevPrice < curPrice;
        }
        return null;
      };

      data.forEach((element) => {
        const isUp = rateChange(element);

        resultHtml += `<div class="col mt-2">
          <div class="card">
            <div class="card-body">
              <h6 class="card-title">${element.symbol}</h6>
              <div class="card-text ${isUp === true ? "text-success" : ""} ${isUp === false ? "text-danger" : ""}">
                ${Number(element.price).toFixed(2)}
              </div>
            </div>
          </div>
        </div>`;
      });

      $rates.innerHTML = resultHtml;
      this.data.prevRates = data;
    },

    renderWallet: async function (data) {
      const $rates = document.querySelector(".js-accounts");
      let resultHtml = "";

      data.forEach((element) => {
        resultHtml += `<div class="col mt-2">
          <div class="card">
            <div class="card-body">
              <h6 class="card-title">${element.asset}</h6>
              <div class="card-text">
                ${element.free}
              </div>
            </div>
          </div>
        </div>`;
      });

      $rates.innerHTML = resultHtml;
      this.data.wallets = data;
    },

    populateSelects: function () {
      const $selects = document.querySelectorAll(".js-pair-select");

      // 2 loop is required (Option instance is memorized otherwise)
      for (let i = 0; i < $selects.length; i++) {
        this.config.symbols.forEach((symbol) => {
          const option = new Option(symbol, symbol);
          $selects[i].options.add(option);
        });
      }
    },

    fillTradeTables: function (trade) {
      const $tableBody = document.querySelectorAll(".js-trade-table tbody");
      const dateString = this.utils.dateToTimestamp(new Date(trade.transactTime));

      $tableBody.forEach(($table) => {
        $table.insertAdjacentHTML(
          "afterbegin",
          `<tr>
            <td class="${trade.side === "SELL" ? "text-danger" : ""} ${trade.side === "BUY" ? "text-success" : ""}">
              ${trade.symbol}
            </td>
            <td class="">${dateString}</td>
            <td>${trade.fills[0].price}</td>
            <td>${trade.fills[0].qty}</td>
            <td>${trade.fills[0].commission} ${trade.fills[0].commissionAsset}</td>
          </tr>`
        );
      });
    },

    fillDepositTable: function (deposit) {
      const $tableBody = document.querySelector(".js-deposit-table tbody");

      $tableBody.insertAdjacentHTML(
        "afterbegin",
        `<tr>
          <td>${deposit.coin}</td>
          <td>${deposit.address}</td>
          <td>${deposit.url}</td>
          <td>${deposit.tag}</td>
        </tr>`
      );
    },

    fillWithdrawTable: function (withdraw) {
      const $tableBody = document.querySelector(".js-withdraw-table tbody");

      let status = withdraw.status || "";

      if (status) {
        switch (status) {
          case 0:
            status = "Email подтверждение";
            break;
          case 1:
            status = "Отмена";
            break;
          case 2:
            status = "Ожидает подтверждения";
            break;
          case 3:
            status = "Отклонено";
            break;
          case 4:
            status = "В процессе";
            break;
          case 5:
            status = "Ошибка";
            break;
          case 6:
            status = "Выполнено";
            break;
          default:
            break;
        }
      }

      $tableBody.insertAdjacentHTML(
        "afterbegin",
        `<tr>
          <td>${withdraw.info}</td>
          <td>${withdraw.id}</td>
          <td>${status}</td>
        </tr>`
      );
    },

    // HELPER FUNCTIONS
    logResponce: function (data, name) {
      const $logger = document.querySelector(".js-logger");

      const date = new Date();
      const spaceBefore = $logger.innerHTML === "" ? "" : "\n\n";
      const timestamp = `===== ${name} at ${this.utils.dateToTimestamp(date)} =====\n\n`;

      $logger.innerHTML += spaceBefore + timestamp + JSON.stringify(data);

      // if ($logger.scrollHeight - ($logger.scrollTop + $logger.clientHeight) < 50)

      $logger.scrollTo({
        top: $logger.scrollHeight,
        left: 0,
        behavior: "smooth",
      });
    },
  };
})(window.APP);
