const express = require('express')
const os = require('os')
const dotenv = require("dotenv")
const util = require('./utilities.js')
const app = express()
dotenv.config()

app.use(express.json())
app.use(express.urlencoded({extended:false}))



const agent = require('./agent_manage.js')
const {debug, errLog} = require("./utilities");
const axios = require("axios");

// 檢查連線是否有金鑰
const connAccess = function (req,res,next){
    if(req.headers.access_code === process.env.API_AUTH_KEY ){
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
        if(req.body.active_code === process.env.ACTIVE_KEY){
            const token = util.generateRandomStr()
            agent.addAgent(agent_ip,token,process.env.AGENT_VOLUME)
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
        if(req.body.code === process.env.ACTIVE_KEY){
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

app.post('/state',async (req,res)=>{
    res.json({data:agent.state()})
})

app.post("/list",(req,res)=>{
    res.json({data:agent.list()})
})

app.post('/support',async (req,res)=>{
    let support_list = {}
    try{
        await Promise.all(Object.keys(agent.list()).map(async mapIp=>{
            await axios.post(`http://${mapIp}:${process.env.AGENT_PORT}/support`).then(response=>{
                support_list[mapIp] = response.data
            }).catch(e=>{
                console.error("Agent Not Support This function !!" , e.toString())
            })
        }))
    }
    catch (e){
        console.error("Support api something wrong !!",e.toString())
    }

    res.json({data:support_list})
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


app.listen(process.env.BACKEND_PORT, () =>
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
    console.log(`[Backend] server start at PORT:${process.env.BACKEND_PORT} successfully `)
})