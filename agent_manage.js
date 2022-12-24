const {sleep, debug, errLog, bugShow} = require("./utilities");
const axios = require('axios')
const qs = require('qs')
const {AGENT_PORT, ACTIVE_CODE, AXIOS_TIMEOUT, AGENT_DEAD_TIME} = require("./ENV.agrs");
const {response} = require("express");
const {post} = require("axios");
const dayjs = require("dayjs");

let agent_list = {}

let task_volume = 0
let in_progress_task = 0

axios.defaults.timeout = AXIOS_TIMEOUT * 1000

module.exports = {
    addAgent : function (agent_ip,token,allow_task = 10){
        debug(`[Add agent] agent found: ${(agent_list[agent_ip])?"True":"False"}`)
        const nowUTCTime = new Date().getTime()
        if(!agent_list[agent_ip]){
            agent_list[agent_ip] = {
                token : token,
                max_task: allow_task,
                processing_task:0,
                alive_time:nowUTCTime
            }
            task_volume += allow_task
        }else {
            agent_list[agent_ip].token = token
            agent_list[agent_ip].alive_time = nowUTCTime
        }
    },
    removeAgent:function (ip){
        if(agent_list[ip]){
            task_volume -= agent_list[ip].max_task
            in_progress_task -= agent_list[ip].processing_task
            agent_list[ip] = null
            return true
        }
        return false
    },
    addTask:function(ip,quantity = 1){
        if(agent_list[ip] && agent_list[ip].max_task >= agent_list[ip].processing_task + quantity){
            agent_list[ip].processing_task += quantity
            in_progress_task += quantity
            debug(`[add Task] Add agent "${ip}" processing_task: ${quantity}`)
            return true
        }
        else{
            debug(`[add Task] Agent "${ip}" has no enough space to add processing_task: ${quantity}`)
        }
        return false
    },
    releaseTask:function (ip,quantity = 1){
        if(agent_list[ip] && 0 <= agent_list[ip].processing_task - quantity){
            agent_list[ip].processing_task -= quantity
            in_progress_task -= quantity
            debug(`[release Task] Release agent "${ip}" processing_task: ${quantity}`)
            return true
        }
        else{
            debug(`[release Task] Agent "${ip}" has no enough space to release processing_task: ${quantity}`)
        }
        return false
    },
    lowLoadAgent:function (task_quantity = 1){
        let lowLoadIP = null
        let loading = -1
        let ipList = Object.keys(agent_list)
        ipList.map(ip=>{
            if(agent_list[ip].processing_task + task_quantity <= agent_list[ip].max_task &&
                (loading == -1 || agent_list[ip].processing_task < loading)){
                lowLoadIP = ip
                loading = agent_list[ip].processing_task
            }
        })
        debug(`[low Load Agent] Found the lowest load Agent "${lowLoadIP}" loading: ${loading}`)
        return lowLoadIP
    },
    getAgent:function (ip){
      return agent_list[ip]
    },
    checkAgentLife:function (ip){
        let serverState = false
        if(agent_list[ip]){
            let deadTime = dayjs(new Date(agent_list[ip].alive_time)).add(AGENT_DEAD_TIME,"s")
            let nowTime = dayjs(new Date())
            serverState = deadTime.isAfter(nowTime)
            debug(`[check Agent Life] Agent ${ip} status is ${serverState?"Alive":"Dead"}`)
        }
        else{
            debug(`[check Agent Life] Cannot use ${ip} find the agent in agent_list`)
        }
        return serverState
    },
    renewAgentLife:function (ip){
        let renewState = false
        if(agent_list[ip]){
            const nowUTCTime = new Date().getTime()
            agent_list[ip].alive_time = nowUTCTime
            debug(`[valid Agent Server] Agent ${ip} life_time renew `)
            renewState = true
        }
        else{
            debug(`[valid Agent Server] Cannot use ${ip} find the agent in agent_list`)
        }
        return renewState
    },
    validationAgent:async function (ip){
        let agentLife = this.checkAgentLife(ip)
        if(!agentLife){
            debug(`[valid Agent Server] Agent ${ip} is dead, try to reset agent`)
            let reset_status = await this.resetAgent(ip)
            // because agent reset setup is depending on internet speed, so here need a timer to pause function
            await sleep(3)
            if(reset_status){
                debug(`[valid Agent Server] Agent ${ip} reset successfully`)
                agentLife = this.checkAgentLife(ip)
            }
        }else{
            debug(`[valid Agent Server] Agent ${ip} is valid`)
        }
        return agentLife
    },
    resetAgent:async function(ip){
        let resetStatus = false
        if(agent_list[ip]){
            debug(`[Reset Agent] Reset Calling found | ip: ${ip}`)
            const config2 = {
                method: 'post',
                baseURL: `http://${ip}:${AGENT_PORT}`,
                url: "/reset",
                data: qs.stringify({code:ACTIVE_CODE}),
                timeout:3000,
            }
            await axios(config2).then(response=>{
                if(response.data.status == "accept"){
                    debug(`[Reset Agent] Reset Calling successful  | ip: ${ip}`)
                    resetStatus = true
                }
            }).catch(err=>{
                errLog('reset Agent',err.toString())
                this.removeAgent(ip)
            })
        }
        return resetStatus

    },
    // calling reset function for all agent in the list
    resetAllAgent :async function (){
        let reset_status = true
        try{
            let agentIp = Object.keys(agent_list)
            debug("[resetAllAgent] System reset all agent data")
            await Promise.all(agentIp.map(async mapAgentIp=>{
                await this.resetAgent(mapAgentIp)
            }))
        }
        catch (e){
            errLog("Reset Agent",e.toString())
            reset_status = false
        }
        return reset_status
    },
    list:function (){
        return {max_task_amount:task_volume,processing_task_amount:in_progress_task,agent_amount : agent_list.length,list : agent_list}
    },
    occupyIdleAgent:async function (task_quantity = 1){
        while (true){
            let serverIp = this.lowLoadAgent(task_quantity)

            if(serverIp){
                let agent_valid = await this.validationAgent(serverIp)
                if(agent_valid){
                    debug(`[Task occupy] Find agent available to use | ip: ${serverIp} !!`)
                    this.addTask(serverIp,task_quantity)
                    return serverIp
                }else{
                    debug(`[Task occupy] Agent ${serverIp} validation failed !!`)
                }
            }
            else{
                debug("[Task occupy] No agent available to use !!")
                await sleep(Math.random()*5)
            }
        }
    },
    /*
    #post_data
        @lang : the coding language used to compile program
        @input : (array)input source code
            @file_name (String)
            @file_data (String)
        @answer : (array)correct answer source code
            @file_name (String)
            @file_data (String)
        @student : (array)student judging answer source code
            @file_name (String)
            @file_data (String)
    #post_params
        @(base64,base64_in,base64_out) control the agent which decode type to used
     */
    postTask:async function (post_data,post_params){
        let post_status = {success:false}
        let agentIp = null
        try{
            agentIp = await this.occupyIdleAgent()

            const config = {
                headers:{
                    token:agent_list[agentIp].token,
                },
                method: 'post',
                baseURL: `http://${agentIp}:${AGENT_PORT}`,
                url: "/judge",
                data : post_data,
                params : post_params
            }
            await axios(config).then(response=>{
                if(response.data.success){
                    post_status.info = response.data.info
                    post_status.success = true
                }
                else{
                    post_status.describe = response.data.describe
                }
            }).catch(err=>{
                errLog("postTask Axios",err.toString(),`statusCode: ${err.response.status}`,err.response.data)
            })
            //await sleep(5)
            this.releaseTask(agentIp)
        }
        catch (e){
            errLog("postTask",e.toString())
        }
        return post_status
    },
    /*
    #post_data
        @input : require input string data
        @execute_data: (Array) require type json
            @file_name (String)
            @file_data (String)
    #post_params
        @(base64,base64_in,base64_out) control the agent which decode type to used
     */
    postExecute:async function (post_data,post_params){
        let post_status = {success:false}
        let agentIp = null
        try{
            agentIp = await this.occupyIdleAgent()

            const config = {
                headers:{
                    token:agent_list[agentIp].token,
                },
                method: 'post',
                baseURL: `http://${agentIp}:${AGENT_PORT}`,
                url: "/execute",
                data : post_data,
                params : post_params
            }
            await axios(config).then(response=>{
                if(response.data.success){
                    post_status.info = response.data.info
                    post_status.success = true
                }
                else{
                    post_status.describe = response.data.describe
                }
            }).catch(err=>{
                errLog("postCompile Axios",err.toString())
            })
            //await sleep(5)
            this.releaseTask(agentIp)
        }
        catch (e){
            errLog("postCompile",e.toString())
            this.releaseTask(agentIp)
        }
        return post_status
    },

}