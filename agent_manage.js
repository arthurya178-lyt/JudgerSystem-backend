const {sleep, debug, errLog, bugShow} = require("./utilities");
const axios = require('axios')
const qs = require('qs')
const {AGENT_PORT, ACTIVE_CODE, AXIOS_TIMEOUT} = require("./ENV.agrs");
const {response} = require("express");
const {post} = require("axios");

let server_list = []
let total_task = 0
let total_processing_task = 0

axios.defaults.timeout = AXIOS_TIMEOUT * 1000

module.exports = {
    addAgent : function (agent_ip,token){
        const agent_found = this.agentIpFind(agent_ip)
        debug(`[Add agent] agent found: ${agent_found}`)
        if(agent_found === -1){
            server_list.push({
                agent_ip:agent_ip,
                token : token,
                max_task: 1,
                processing_task:0
            })
            total_task += 1
        }else {
            server_list[agent_found].token = token
        }
    },
    removeAgent:function (token){
        const agent_find = this.agentTokenFind(token)
        if(agent_find > -1){
            total_task -= server_list[agent_find].max_task
            total_processing_task -= server_list[agent_find].processing_task
            server_list.splice(agent_find,1)
            return true
        }
        return false
    },
    resetAgent:async function(token){
        const agent_find = this.agentTokenFind(token)
        if(agent_find > -1){
            debug(`[Reset Agent] Reset Calling found | ip: ${server_list[agent_find].agent_ip}`)
            const config2 = {
                method: 'post',
                baseURL: `http://${server_list[agent_find].agent_ip}:${AGENT_PORT}`,
                url: "/reset",
                data: qs.stringify({code:ACTIVE_CODE}),
                timeout:1000,
            }
            await axios(config2).then(response=>{
                if(response.data.status == "accept"){
                    debug(`[Reset Agent] Reset Calling successful  | ip: ${server_list[agent_find].agent_ip}`)
                }
            }).catch(err=>{
                errLog('reset Agent',err.toString())
                this.removeAgent(server_list[agent_find].token)
            })
            return true
        }
        return false

    },
    checkAgentIdle:async function(agent_ip,token){
        let rtStatus = false
        try{
            const config = {
                headers:{
                    token:token,
                },
                method: 'post',
                baseURL: `http://${agent_ip}:${AGENT_PORT}`,
                url: "/connection",
                timeout:5000,
            }
            await axios(config).then(async response=>{
                if(response.data.status === "idle"){
                    rtStatus = true
                }
                else if(response.data.status === "busy"){
                    debug(`[Check Agent Idle] Agent Busy | ip ${agent_ip}`)
                    rtStatus = false
                }
                else if(response.data.status === "failed"){
                    debug(`[Check Agent Idle] Agent connect failed, system try to refresh this agent | ip ${agent_ip}`)
                    await this.resetAgent(token)
                    rtStatus = false
                }
                else{
                    errLog(`Check Agent Idle`,'Unexpected Error!!',response.data)
                    rtStatus = false
                }
            }).catch(async err=>{
                errLog(`Check Agent Idle`,`Connect to agent ip: ${agent_ip} failed!!`,err.toString())
                await this.resetAgent(token)
                rtStatus = false
            })
        }
        catch (e){
            errLog(`[Task occupy]`,`Unexpected Error`,e.toString())
        }
        return rtStatus
    },
    // calling reset function for all agent in the list
    resetAllAgent :async function (){
        let reset_status = true
        try{
            let agentIp = []
            server_list.map(mapServer=>{
                agentIp.push(mapServer.token)
            })
            debug("[resetAllAgent] System reset all agent data")
            await Promise.all(agentIp.map(async mapAgentToken=>{
                await this.resetAgent(mapAgentToken)
            }))
        }
        catch (e){
            errLog("Reset Agent",e.toString())
            reset_status = false
        }
        return reset_status
    },
    agentIpFind : function (agent_ip){

        for(let i = 0 ; i < server_list.length; i++){
            if(server_list[i].agent_ip === agent_ip)
                return i
        }
        return -1
    },
    agentTokenFind : function (token) {
        for(let i = 0 ; i < server_list.length; i++){
            if(server_list[i].token === token)
                return i
        }
        return -1
    },
    list:function (){
        return {max_task_amount:total_task,processing_task_amount:total_processing_task,agent_amount : server_list.length,list : server_list}
    },
    occupyIdleAgent:async function (){
        while (true){
            if(total_processing_task < total_task){
                for( let server = 0; server < server_list.length;server++ ){
                    if(server_list[server].processing_task < server_list[server].max_task){
                        if(await this.checkAgentIdle(server_list[server].agent_ip,server_list[server].token)){
                            server_list[server].processing_task++
                            total_processing_task += 1
                            debug(`[Task occupy] Token: ${server_list[server].token} | remaining task: ${total_processing_task} `)
                            return {task_number:total_processing_task ,token:server_list[server].token, id:server}
                        }
                        else {
                            errLog(`Task occupy`,`Agent Idle Error, may somthing wrong!`)
                        }
                    }
                }
                errLog(`[Task occupy]`,`No Aviliable Agent to used , server will try to find again !!`)
                await sleep(3)
            }
            else{
                debug("[Task occupy] No agent aviliable to use !!")
                await sleep(Math.random()*3)
            }
        }
    },
    releaseAgent: function (token){
        let releaseId = this.agentTokenFind(token)
        if(releaseId > -1){
            if(server_list[releaseId].processing_task >= 0){
                server_list[releaseId].processing_task -= 1
                total_processing_task -= 1
                debug(`[Task release] Token: ${token} | remaining task: ${total_processing_task} `)
                return true
            }
            else{
                debug('[Task release] no enough space to release')
            }
        }else{
            debug('[Task release] release target not exist')
        }
        return false
    },
    postTask:async function (post_data,post_params){
        let post_status = {success:false}
        try{
            let idleAgent = await this.occupyIdleAgent()

            const config = {
                headers:{
                    token:server_list[idleAgent.id].token,
                },
                method: 'post',
                baseURL: `http://${server_list[idleAgent.id].agent_ip}:${AGENT_PORT}`,
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
            })
            // await sleep(15)
            this.releaseAgent(idleAgent.token)
        }
        catch (e){
            errLog("postTask",e.toString())
        }
        return post_status
    },


}