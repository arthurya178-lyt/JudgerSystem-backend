
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
        return new Promise(resolve => setTimeout(() =>resolve(), second*1000));
    },
    debug:function (msg){
        if(DEBUG){
            console.log(msg)
        }
    },
    errLog:function (place,...msg){
        console.error(`[${place}] ********** START **********`)
        for(let i = 0 ; i < msg.length ; i++)
            console.error(msg[i])
        console.error(`[${place}] **********  END  **********`)
    }
}