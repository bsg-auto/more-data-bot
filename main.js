const fs = require('fs')
const Jimp = require('jimp')
const Axios = require('axios').default
//require('@tensorflow/tfjs-node')
const tf = require('@tensorflow/tfjs-node')
/**
 * Created on 1398/11/16 (2020/2/5).
 * @author {@link https://mirismaili.github.io S. Mahdi Mir-Ismaili}
 */
'use strict'
const IMAGE_WIDTH = 100
const IMAGE_HEIGHT = 32
const IMAGE_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT

const DIGITS_RECTS_OFFSETS = [20, 32, 44, 56, 68]
const NUM_DIGITS_PER_IMAGE = DIGITS_RECTS_OFFSETS.length  // 5
const DIGITS_RECTS_TOP = 6
const DIGIT_ACTUAL_WIDTH = 14
const DIGIT_WIDTH = 20
const DIGIT_HEIGHT = 20
const DIGIT_SIZE = DIGIT_WIDTH * DIGIT_HEIGHT

const EXEC_POOL_SIZE = 1//00
let numExecuting = 0
let id = 0
const snooze = ms => new Promise(resolve => setTimeout(resolve, ms))  // https://stackoverflow.com/a/13448477/5318303

const axios = Axios.create({
	baseURL: 'https://bashgah.com',
	timeout: 15000,
	maxRedirects: 0,
	withCredentials: true,
})

function randomStr10(l = undefined) {
	return Math.random().toString(36).substr(2, l)
}

function receivedCookiesToObj(receivedCookies) {
	return receivedCookies.map(cookie => cookie.split(';').reduce((prev, current) => {
		const [name, value] = current.split('=')
		prev[name.trimStart()] = value === undefined ? true : value
		return prev
	}, {}))
}

function cookiesObjToBeSent(cookiesObj) {
	return cookiesObj.map(cookie => Object.entries(cookie)[0].join('=')).join('; ')
}

function combineColors(foreColor, backColor, alpha) {
	return alpha * foreColor + (1 - alpha) * backColor
}

function getImagesDataset(rawData) {
	const top = DIGITS_RECTS_TOP
	const bottom = top + DIGIT_HEIGHT
	let index = 0
	const imagesDataset = new Float32Array(DIGIT_SIZE * NUM_DIGITS_PER_IMAGE)
	
	for (const left of DIGITS_RECTS_OFFSETS) {
		const right = left + DIGIT_ACTUAL_WIDTH
		const extraPixels = DIGIT_WIDTH - (right - left)
		
		for (let y = top; y < bottom; y++) {
			for (let i = 0; i < extraPixels / 2; i++) imagesDataset[index++] = 0
			
			for (let x = left; x < right; x++) {
				const redIndex = (x + y * IMAGE_WIDTH) * 4
				
				const rF = rawData[redIndex] / 255  // the Red   value of Foreground
				const gF = rawData[redIndex + 1] / 255  // the Green value of Foreground
				const bF = rawData[redIndex + 2] / 255  // the Blue  value of Foreground
				const a = rawData[redIndex + 3] / 255  // the Alpha value of Foreground
				
				// Calculate the color on a white (0xFFFFFF) background
				const r = combineColors(rF, 1, a)
				const g = combineColors(gF, 1, a)
				const b = combineColors(bF, 1, a)
				
				// Because the image is almost grayscale, we only include one channel ((r+g+b)/3):
				imagesDataset[index++] = 1 - ((r + g + b) / 3)
				// if (index < 110) {
				// 	console.log(index - 1)
				// 	console.log(x)
				// 	console.log(y)
				// 	console.log(redIndex)
				// 	console.log(rawData[redIndex])
				// 	console.log(rawData[redIndex + 1])
				// 	console.log(rawData[redIndex + 2])
				// 	console.log(rawData[redIndex + 3])
				// 	console.log(Math.round((r + g + b) / 3 * 255))
				// 	console.log('----------------------')
				// }
			}
			
			for (let i = 0; i < extraPixels / 2; i++) imagesDataset[index++] = 0
		}
	}
	return imagesDataset
}

async function worker(id) {
	let response = await axios.get(`/Account/CaptchaImage?id=${Date.now()}`, {
		responseType: 'stream',
		// headers: {
		// 	'Host': 'bashgah.com',
		// 	'Connection': 'keep-alive',
		// 	'Cache-Control': 'max-age=0',
		// 	'Upgrade-Insecure-Requests': '1',
		// 	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
		// 	'Sec-Fetch-User': '?1',
		// 	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
		// 	'Sec-Fetch-Site': 'none',
		// 	'Sec-Fetch-Mode': 'navigate',
		// 	'Accept-Encoding': 'gzip, deflate, br',
		// 	'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
		// },
	})
	
	console.log(response.status, response.statusText)
	//console.log(response.headers)
	// console.log(response.data.toString('hex'))
	//console.log(response.config)
	
	let cookies = receivedCookiesToObj(response.headers['set-cookie'])
	
	const resDataStream = response.data
	
	// Write image to file:
	const defPath = `downloaded-captcha-${id}.png`
	resDataStream.pipe(fs.createWriteStream(defPath))
	
	// Convert the stream to array-buffer:
	const chunks = []
	for await (let chunk of resDataStream) chunks.push(chunk)
	
	const image = await Jimp.read(Buffer.concat(chunks))
	const rawData = image.bitmap.data
	
	const imagesDataset = getImagesDataset(rawData)
	
	const xs = tf.tensor2d(imagesDataset, [NUM_DIGITS_PER_IMAGE, DIGIT_SIZE])
	//xs.print('verbose')
	
	if (!model) model = await modelPromise
	const prediction = model.predict(xs.reshape([NUM_DIGITS_PER_IMAGE, DIGIT_HEIGHT, DIGIT_WIDTH, 1]))
	const preds = prediction.argMax([-1])
	const predsAr = preds.arraySync()
	
	const answer = predsAr.join('')
	console.log('resolved:', answer)
	
	response = await axios.post('/Account/Authenticate', {
		// UserName: randomStr10(),
		// Password: randomStr10(),
		CaptchaCode: answer,
	}, {
		headers: {
			// 'Host': 'bashgah.com',
			// 'Connection': 'keep-alive',
			// 'Accept': 'application/json, text/plain, */*',
			// 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
			// 'Content-Type': 'application/json;charset=UTF-8',
			// 'Origin': 'https://bashgah.com',
			// 'Sec-Fetch-Site': 'same-origin',
			// 'Sec-Fetch-Mode': 'cors',
			// 'Referer': 'https://bashgah.com/',
			// 'Accept-Encoding': 'gzip, deflate, br',
			// 'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
			'Cookie': cookiesObjToBeSent(cookies),
		},
	})
	
	console.log(response.status, '/', response.statusText)
	//console.log(response.headers)
	const errorMsg = response.data.error
	//console.log(response.data)
	
	switch (errorMsg) {
		case 'کد امنیتی صحیح نیست':
			console.log('WRONG!')
			fs.rename(defPath, `wrongs/${answer}-${randomStr10(5)}.png`, err => {
				if (err) console.error(err)
			})
			break
			
			// case 'نام کاربری یا کلمه عبور اشتباه است':
		case 'کاربری با مشخصات ذکر شده موجود نمی باشد':
			console.log('CORRECT')
			fs.rename(defPath, `corrects/${answer}-${randomStr10(5)}.png`, err => {
				if (err) console.error(err)
			})
			break
		
		default:
			console.error('Unexpected error message! response:', response.data)
	}
	
	numExecuting--
}

let model = null
let modelPromise = tf.loadLayersModel('file://../captcha-reader1/trained-models/bashgah-captcha@1398-11-17@10073.json')

;(async () => {
	// noinspection InfiniteLoopJS
	while (true) {
		while (numExecuting >= EXEC_POOL_SIZE) {
			console.log('NUM_EXECUTING:', numExecuting)
			await snooze(1000)
		}
		
		id++
		numExecuting++
		console.log('numExecuting:', numExecuting)
		// noinspection ES6MissingAwait
		worker(id)
		
		console.log('id:', id)
		console.log(`-------------------`)
	}
})()
