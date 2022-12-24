const express = require('express')
const os = require('os')
const util = require('./utilities.js')
const app = express()


app.use(express.json())
app.use(express.urlencoded({extended:false}))



const agent = require('./agent_manage.js')
const {BACKEND_PORT, ACTIVE_CODE, ACCESS_CODE, AGENT_MAX_VOLUME} = require("./ENV.agrs");
const {debug, errLog} = require("./utilities");

// 檢查連線是否有金鑰
const connAccess = function (req,res,next){
    if(req.headers.access_code === ACCESS_CODE ){
        next()
    }
    else{
        res.json({
            status: "failed",
            success: false,
            describe: "No Authorize request, check your access code ! access_code should put in headers "
        })
    }
}



// 新增 Agent 到叢集中
app.post('/activate', async (req, res) =>
{
    let response = {success:false}
    try{
        let agent_ip = req.ip.split(":")[3]
        if(req.body.active_code === ACTIVE_CODE){
            const token = util.generateRandomStr()
            agent.addAgent(agent_ip,token,AGENT_MAX_VOLUME)
            debug(`[Active Agent] Active success | ip ${agent_ip} | Token: ${token}`)
            response.success = true
            response.token = token
        }
        else{
            debug(`[Active Agent] Active failed | receive code: ${req.body.active_code} | ip ${agent_ip} `)
        }
    }
    catch (e){
        errLog("/activate",e.toString())
    }

    res.json(response)
})

app.post('/judge',connAccess,async (req,res)=>{
    const judge_response = {success:false}
    try{
        // Validation request parameter
        if(!req.body.lang) throw "require lang parameter"
        if(!req.body.input) throw "require input parameter"
        if(!req.body.answer) throw "require answer parameter"
        if(!req.body.student) throw "require student parameter"
        if(!Array.isArray(req.body.input)) throw "input parameter should Array type"
        if(!Array.isArray(req.body.answer)) throw "answer parameter should Array type"
        if(!Array.isArray(req.body.student)) throw "student parameter should Array type"

        const params = {
            base64:req.query.base64,
            base64_in:req.query.base64_in,
            base64_out:req.query.base64_out
        }
        const code_data = {
            lang: req.body.lang,
            input: req.body.input,
            answer: req.body.answer,
            student: req.body.student
        }

        // console.log(code_data)
        const postResult = await agent.postTask(code_data,params)
        if(postResult.success){
            judge_response.success = true
            judge_response.info = postResult.info
        }
        else{
            judge_response.describe = postResult.describe
        }
    }
    catch (e){
        errLog("/judge",e.toString())
        judge_response.describe = e.toString()
    }

    res.json(judge_response)
})

app.post('/compile',async (req,res)=>{
    const compile_response = {success:false}
    try{
        // Validation request parameter
        if(!req.body.lang) throw "require lang parameter"
        if(!req.body.source) throw "require source parameter"
        if(!Array.isArray(req.body.source) ) throw "code parameter should Array type"

        const params = {
            base64:req.query.base64,
            base64_in:req.query.base64_in,
            base64_out:req.query.base64_out,
            input_text:req.query.input_text
        }

        const code_data = {
            lang: req.body.lang,
            input: req.body.input,
            source: req.body.source,
        }

        // console.log(code_data)
        const postResult = await agent.postExecute(code_data,params)
        if(postResult.success){
            compile_response.success = true
            compile_response.info = postResult.info
        }
        else{
            compile_response.describe = postResult.describe
        }
    }
    catch (e){
        errLog("/compile",e.toString())
        compile_response.describe = e.toString()
    }

    res.json(compile_response)
})



app.post('/test',async (req,res)=>{
    const request = {
        lang:1
    }
    await agent.postTask(request)

    res.json({done:true})
})


app.post("/reset",async (req,res)=>{
    let reset_status = {status:"failed"}
    try{
        let agent_ip = req.ip.split(":")[3]
        if(req.body.code === ACTIVE_CODE){
            if(agent.resetAllAgent()){
                debug(`[Reset Backend] Reset success`)
                reset_status.status = "success"
            }
            else{
                debug(`[Reset Backend] Reset failed`)
            }
        }
        else{
            debug(`[Reset Backend] reset failed | receive code: ${req.body.code} | ip ${agent_ip} `)
        }
    }
    catch (e){
        errLog('/reset',e.toString())
    }
    res.json(reset_status)
})

app.post('/list/agent',async (req,res)=>{
    res.json({data:agent.list()})
})

app.post('/verify',async (req,res)=>{
    let response = {verify:false}
    try{
        let agent_ip = req.ip.split(":")[3]
        if(agent.getAgent(agent_ip).token === req.body.token){
            agent.renewAgentLife(agent_ip)
            response.verify = true
        }
    }
    catch (e){
        errLog('/verify',e.toString())
    }
    res.json(response)
})


app.listen(BACKEND_PORT, () =>
{
    const ipDetails = os.networkInterfaces()
    const ipKey = Object.keys(ipDetails)
    ipKey.map(mapKey =>
    {
        ipDetails[mapKey].map(mapEthCard =>
        {
            if (mapEthCard.family === "IPv4")
            {
                console.warn(`start at [ IP:${mapEthCard.cidr} ]`)
            }
        })
    })
    console.log(`[Backend] server start at PORT:${BACKEND_PORT} successfully `)
})