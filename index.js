const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const UserAgent = require('user-agents');
const moment = require('moment-timezone');
const cheerio = require('cheerio');
const chalk = require('chalk');
const fs = require('fs');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

const TIMEZONE = 'Asia/Jakarta';
const DEFAULT_RETRY_DELAY = 5000;
const DEFAULT_RETRIES = 5;
const ACCOUNT_DELAY = 3000;
const TWELVE_HOURS_IN_SECONDS = 12 * 60 * 60;

class NexyAi {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            "Origin": "https://point.nexyai.io",
            "Referer": "https://point.nexyai.io/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": new UserAgent().toString()
        };
        this.BASE_API = "https://api.nexyai.io/client";
        this.proxies = [];
        this.proxy_index = 0;
        this.account_proxies = {};
        this.update_frequiency = Math.floor(Math.random() * 6) + 60; // 60-65
    }

    clearTerminal() {
        process.stdout.write(process.platform === 'win32' ? '\x1Bc' : '\x1B[2J\x1B[3J\x1B[H');
    }

    log(message) {
        console.log(
            `${chalk.cyan.bold(`[ ${moment().tz(TIMEZONE).format('MM/DD/YY hh:mm:ss A z')} ]`)} `+
            `${chalk.white.bold(' | ')}${message}`
        );
    }

    welcome() {
        console.log(`
        ${chalk.green.bold('Auto Claim ')}${chalk.blue.bold('Nexy Ai - BOT')}
        `);
    }

    formatSeconds(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    async loadProxies() {
        const filename = "proxy.txt";
        try {
            if (!fs.existsSync(filename)) {
                this.log(`${chalk.red.bold(`File ${filename} Not Found.`)}`);
                return;
            }
            
            const content = await readFileAsync(filename, 'utf8');
            this.proxies = content.split('\n').filter(line => line.trim());
            
            if (!this.proxies.length) {
                this.log(`${chalk.red.bold('No Proxies Found.')}`);
                return;
            }

            this.log(`${chalk.green.bold('Proxies Total  : ')}${chalk.white.bold(this.proxies.length)}`);
        } catch (e) {
            this.log(`${chalk.red.bold(`Failed To Load Proxies: ${e}`)}`);
            this.proxies = [];
        }
    }

    checkProxySchemes(proxy) {
        const schemes = ["http://", "https://", "socks4://", "socks5://"];
        return schemes.some(scheme => proxy.startsWith(scheme)) ? proxy : `http://${proxy}`;
    }

    getNextProxyForAccount(token) {
        if (!this.account_proxies[token] && this.proxies.length) {
            const proxy = this.checkProxySchemes(this.proxies[this.proxy_index]);
            this.account_proxies[token] = proxy;
            this.proxy_index = (this.proxy_index + 1) % this.proxies.length;
        }
        return this.account_proxies[token] || null;
    }
    
    decodeToken(token) {
        try {
            const [, payload] = token.split(".");
            const padding = '='.repeat((4 - payload.length % 4) % 4);
            const decodedPayload = Buffer.from(payload + padding, 'base64').toString('utf-8');
            const parsedPayload = JSON.parse(decodedPayload);
            return parsedPayload?.user?.metadata?.name || "Unknown";
        } catch (e) {
            return "Unknown";
        }
    }
        
    clearDesc(description) {
        try {
            return cheerio.load(description).text();
        } catch (e) {
            return "No Description";
        }
    }
        
    printQuestion() {
        console.log("1. Run With Private Proxy");
        console.log("2. Run Without Proxy");
        
        return new Promise((resolve) => {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const askQuestion = () => {
                readline.question("Choose [1/2] -> ", (answer) => {
                    const choose = parseInt(answer.trim());
                    if ([1, 2].includes(choose)) {
                        const proxyType = choose === 1 
                            ? "Run With Private Proxy" 
                            : "Run Without Proxy";
                        console.log(`${chalk.green.bold(`${proxyType} Selected.`)}`);
                        readline.close();
                        resolve(choose);
                    } else {
                        console.log(`${chalk.red.bold("Please enter either 1 or 2.")}`);
                        askQuestion();
                    }
                });
            };
            
            askQuestion();
        });
    }
    
    async createAxiosInstance(proxy = null) {
        let axiosConfig = {
            timeout: 60000,
            headers: { ...this.headers }
        };
        
        if (proxy) {
            const proxyAgent = proxy.startsWith('socks') 
                ? new SocksProxyAgent(proxy)
                : new HttpsProxyAgent(proxy);
            
            axiosConfig.httpsAgent = proxyAgent;
            axiosConfig.httpAgent = proxyAgent;
        }
        
        return axios.create(axiosConfig);
    }
    
    async checkConnection(proxy = null) {
        try {
            const axiosInstance = await this.createAxiosInstance(proxy);
            await axiosInstance.get(this.BASE_API);
            return true;
        } catch (e) {
            return null;
        }
    }
    
    // Common function for API calls with retry
    async callApi(method, url, token, data = null, proxy = null, retries = DEFAULT_RETRIES) {
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        
        if (data === null && method === 'post') {
            headers["Content-Length"] = "0";
        }
        
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const axiosInstance = await this.createAxiosInstance(proxy);
                let response;
                
                if (method === 'get') {
                    response = await axiosInstance.get(url, { headers });
                } else if (method === 'post') {
                    response = await axiosInstance.post(url, data, { headers });
                }
                
                return response.data;
            } catch (e) {
                // Handle specific error for claim API
                if (url.includes('/claim/') && e.response && e.response.status === 400) {
                    return null;
                }
                
                if (attempt < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, DEFAULT_RETRY_DELAY));
                    continue;
                }
                return null;
            }
        }
    }
    
    // Using common callApi function
    async rewardsStatistic(token, proxy = null) {
        const url = `${this.BASE_API}/rewards/statistic`;
        return this.callApi('get', url, token, null, proxy);
    }
    
    async taskLists(token, proxy = null) {
        const url = `${this.BASE_API}/tasks`;
        return this.callApi('get', url, token, null, proxy);
    }
    
    async verifyTasks(token, taskId, proxy = null) {
        const url = `${this.BASE_API}/user-tasks/verify/${taskId}`;
        return this.callApi('post', url, token, null, proxy);
    }
    
    async claimTasks(token, taskId, proxy = null) {
        const url = `${this.BASE_API}/user-tasks/claim/${taskId}`;
        return this.callApi('post', url, token, null, proxy);
    }
    
    async processCheckConnection(token, useProxy) {
        const message = useProxy 
            ? "Checking Proxy Connection, Wait..."
            : "Checking Connection, Wait...";

        process.stdout.write(
            `${chalk.cyan.bold(`[ ${moment().tz(TIMEZONE).format('MM/DD/YY hh:mm:ss A z')} ]`)}`+
            `${chalk.white.bold(' | ')}`+
            `${chalk.yellow.bold(message)}\r`
        );

        const proxy = useProxy ? this.getNextProxyForAccount(token) : null;
        const isValid = await this.checkConnection(proxy);
        
        if (!isValid) {
            this.log(`${chalk.cyan.bold('Proxy     :')}${chalk.white.bold(` ${proxy} `)}${chalk.magenta.bold('-')}${chalk.red.bold(' Not 200 OK ')}          `);
            return false;
        }
        
        this.log(`${chalk.cyan.bold('Proxy     :')}${chalk.white.bold(` ${proxy} `)}${chalk.magenta.bold('-')}${chalk.green.bold(' 200 OK ')}                  `);
        return true;
    }

    async handleCompletedTask(token, taskId, proxy, reward) {
        const claim = await this.claimTasks(token, taskId, proxy);
        
        this.log(
            `${chalk.magenta.bold('     > ')}` +
            (claim 
                ? `${chalk.green.bold('Claimed Successfully')}${chalk.magenta.bold(' - ')}${chalk.cyan.bold('Reward:')}${chalk.white.bold(` ${reward} PTS `)}`
                : `${chalk.yellow.bold('Already Claimed')}`
            )
        );
    }

    async handleInProgressTask(token, taskId, proxy, reward) {
        for (let remaining = this.update_frequiency; remaining > 0; remaining--) {
            process.stdout.write(
                `${chalk.cyan.bold(`[ ${moment().tz(TIMEZONE).format('MM/DD/YY hh:mm:ss A z')} ]`)}`+
                `${chalk.white.bold(' | ')}`+
                `${chalk.magenta.bold('     > ')}`+
                `${chalk.blue.bold('Wait for')}`+
                `${chalk.yellow.bold(` ${remaining} `)}`+
                `${chalk.blue.bold('Seconds...')}\r`
            );
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
            
        const reVerify = await this.verifyTasks(token, taskId, proxy);
        if (!reVerify) {
            this.log(`${chalk.magenta.bold('     > ')}${chalk.red.bold('GET Task Status Failed')}              `);
            return;
        }

        const currentStatus = reVerify.data.status;
        
        if (currentStatus === "completed") {
            const claim = await this.claimTasks(token, taskId, proxy);
            
            this.log(
                `${chalk.magenta.bold('     > ')}` +
                (claim 
                    ? `${chalk.green.bold('Claimed Successfully')}${chalk.magenta.bold(' - ')}${chalk.cyan.bold('Reward:')}${chalk.white.bold(` ${reward} PTS `)}` 
                    : `${chalk.red.bold('Not Claimed')}                         `
                )
            );
        } else {
            this.log(`${chalk.magenta.bold('     > ')}${chalk.yellow.bold('Not Ready to Claim')}               `);
        }
    }

    async processTask(token, task, proxy) {
        if (!task) return;
        
        const { id: taskId, title, description, points: reward } = task;
        const desc = this.clearDesc(description);

        this.log(`${chalk.green.bold('  ● ')}${chalk.blue.bold(title)}${chalk.magenta.bold(' - ')}${chalk.white.bold(desc)}`);

        const verify = await this.verifyTasks(token, taskId, proxy);
        if (!verify) return;

        const status = verify.data.status;
        
        if (status === "completed") {
            await this.handleCompletedTask(token, taskId, proxy, reward);
        } else if (status === "in_progress") {
            await this.handleInProgressTask(token, taskId, proxy, reward);
        }
    }

    async processAccounts(token, xName, useProxy) {
        this.log(`${chalk.cyan.bold('Account   :')}${chalk.white.bold(` ${xName} `)}`);

        const isValid = await this.processCheckConnection(token, useProxy);
        if (!isValid) return;

        const proxy = useProxy ? this.getNextProxyForAccount(token) : null;
    
        // Get balance
        const balance = await this.rewardsStatistic(token, proxy);
        if (balance?.data?.social) {
            this.log(`${chalk.cyan.bold('Balance   :')}${chalk.white.bold(` ${balance.data.social} PTS `)}`);
        }

        // Get tasks
        const taskLists = await this.taskLists(token, proxy);
        if (!taskLists?.data?.length) {
            this.log(`${chalk.cyan.bold('Task Lists:')}${chalk.red.bold(' Data Is None ')}`);
            return;
        }

        this.log(`${chalk.cyan.bold('Task Lists:')}`);
        
        // Process each task
        for (const task of taskLists.data) {
            await this.processTask(token, task, proxy);
        }
    }

    async main() {
        try {
            const tokensContent = await readFileAsync('tokens.txt', 'utf8');
            const tokens = tokensContent.split('\n').filter(line => line.trim());
            
            const useProxyChoice = await this.printQuestion();

            while (true) {
                const useProxy = useProxyChoice === 1;

                this.clearTerminal();
                this.welcome();
                this.log(`${chalk.green.bold('Account\'s Total: ')}${chalk.white.bold(tokens.length)}`);

                if (useProxy) {
                    await this.loadProxies();
                }
                
                const separator = "=".repeat(23);
                for (let idx = 0; idx < tokens.length; idx++) {
                    const token = tokens[idx];
                    if (!token) continue;
                    
                    const xName = this.decodeToken(token);
                    this.log(
                        `${chalk.cyan.bold(`${separator}[`)}`+
                        `${chalk.white.bold(` ${idx + 1} `)}`+
                        `${chalk.cyan.bold('Of')}`+
                        `${chalk.white.bold(` ${tokens.length} `)}`+
                        `${chalk.cyan.bold(`]${separator}`)}`
                    );
                    await this.processAccounts(token, xName, useProxy);
                    await new Promise(resolve => setTimeout(resolve, ACCOUNT_DELAY));
                }

                this.log(`${chalk.cyan.bold('=')}`.repeat(68));
                
                // Wait 12 hours
                let seconds = TWELVE_HOURS_IN_SECONDS;
                while (seconds > 0) {
                    const formattedTime = this.formatSeconds(seconds);
                    process.stdout.write(
                        `${chalk.cyan.bold('[ Wait for')}`+
                        `${chalk.white.bold(` ${formattedTime} `)}`+
                        `${chalk.cyan.bold('... ]')}`+
                        `${chalk.white.bold(' | ')}`+
                        `${chalk.blue.bold('All Accounts Have Been Processed.')}\r`
                    );
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    seconds--;
                }
            }
        } catch (e) {
            if (e.code === 'ENOENT' && e.path.includes('tokens.txt')) {
                this.log(`${chalk.red.bold('File \'tokens.txt\' Not Found.')}`);
                return;
            }
            this.log(`${chalk.red.bold(`Error: ${e}`)}`);
            throw e;
        }
    }
}

(async () => {
    try {
        const bot = new NexyAi();
        await bot.main();
    } catch (e) {
        if (e.name !== 'Error' || e.message !== 'Interrupted') {
            console.log(
                `${chalk.cyan.bold(`[ ${moment().tz(TIMEZONE).format('MM/DD/YY hh:mm:ss A z')} ]`)}`+
                `${chalk.white.bold(' | ')}`+
                `${chalk.red.bold('[ EXIT ] Nexy Ai - BOT')}` +
                `                                       `                              
            );
        }
    }
})();

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log(
        `${chalk.cyan.bold(`[ ${moment().tz(TIMEZONE).format('MM/DD/YY hh:mm:ss A z')} ]`)}`+
        `${chalk.white.bold(' | ')}`+
        `${chalk.red.bold('[ EXIT ] Nexy Ai - BOT')}` +
        `                                       `                              
    );
    process.exit();
});