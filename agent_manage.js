const {sleep, debug, errLog} = require("./utilities");
const axios = require('axios')
const qs = require('qs')
const {AGENT_PORT, ACTIVE_CODE} = require("./ENV.agrs");
const {response} = require("express");
const {post} = require("axios");

let server_list = []
let total_task = 0
let total_processing_task = 0

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
    resetAgent :async function (){
        let reset_status = true
        try{
            let agentIp = []
            server_list.map(mapServer=>{
                agentIp.push(mapServer.agent_ip)
            })
            server_list = []
            await Promise.all(agentIp.map(async mapAgentIP=>{
                const config = {
                    method: 'post',
                    baseURL: `http://${mapAgentIP}:${AGENT_PORT}`,
                    url: "/reset",
                    data : qs.stringify({code:ACTIVE_CODE})
                }
                await axios(config).then((response)=>{
                    if(response.data.status === "reject"){
                        errLog("Reset Agent",`Agent reset Failed | ip: ${mapAgentIP}`,response.data)
                        reset_status.done = false
                    }
                    else{
                        debug(`[Reset Agent] Reset Calling Success | ip: ${mapAgentIP}`)
                    }
                })
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
                        server_list[server].processing_task++
                        total_processing_task += 1
                        debug(`[Task occupy] Token: ${server_list[server].token} | remaining task: ${total_processing_task} `)
                        return {task_number:total_processing_task ,token:server_list[server].token, id:server}
                    }
                }
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