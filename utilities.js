const chalk = require("cli-color")

const DEBUG = true

module.exports = {
    generateRandomStr:function (SIZE= 32){
        const charList = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
        let output = ""
        for(let i = 0 ; i < SIZE;i++){
            output += charList[Math.floor(Math.random()*charList.length)]
        }
        return output
    },
    sleep: function (second){
        if(DEBUG){
            console.log(chalk.blue(`[UTIL-SLEEP] programe stop ${second}'s`))
        }
        return new Promise(resolve => setTimeout(() =>resolve(), second*1000));
    },
    debug:function (msg){
        if(DEBUG){
            console.log(chalk.green(msg))
        }
    },
    errLog:function (place,...msg){
        console.log(chalk.redBright(`[${place}] ********** START **********`))
        for(let i = 0 ; i < msg.length ; i++)
            console.log(chalk.red(msg[i]))
        console.log(chalk.redBright(`[${place}] **********  END  **********`))
    },
    bugShow:function(msg){
        console.log(chalk.yellow(`BBB UUU GGG | ${msg} |`))
    }
}