
	var vid = document.getElementById('videoel');
	var overlay = document.getElementById('overlay');
	var overlayCC = overlay.getContext('2d');

	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	window.URL = window.URL || window.webkitURL || window.msURL || window.mozURL;

	// check for camerasupport
	if (navigator.getUserMedia) {
		// set up stream
		
		var videoSelector = {video : true};
		if (window.navigator.appVersion.match(/Chrome\/(.*?) /)) {
			var chromeVersion = parseInt(window.navigator.appVersion.match(/Chrome\/(\d+)\./)[1], 10);
			if (chromeVersion < 20) {
				videoSelector = "video";
			}
		};

		navigator.getUserMedia(videoSelector, function( stream ) {
			if (vid.mozCaptureStream) {
				vid.mozSrcObject = stream;
			} else {
				vid.src = (window.URL && window.URL.createObjectURL(stream)) || stream;
				startVideo()
			}
			vid.play();
		}, function() {
			//insertAltVideo(vid);
			alert("There was some problem trying to fetch video from your webcam. If you have a webcam, please make sure to accept when the browser asks for access to your webcam.");
		});
	} else {
		//insertAltVideo(vid);
		alert("This demo depends on getUserMedia, which your browser does not seem to support. :(");
	}

	/*********** setup of emotion detection *************/

	var ctrack = new clm.tracker({useWebGL : true});
	ctrack.init(pModel);

	function startVideo() {
		// start video
		vid.play();
		// start tracking
		ctrack.start(vid);
		// start loop to draw face
		drawLoop();
	}

	function averagePoints(pointArray){
		//takes in array of 2 element arrays, returns 2 element array [xavg, yavg]

		var averageCoordinates = [0,0]

		pointArray.forEach(function(point){
			for(var i = 0; i < averageCoordinates.length; i++)
				averageCoordinates[i] += point[i]
		})

		return averageCoordinates.map(function(e){
			return e / pointArray.length
		})
	}

	function computeBoundingBox(pointArray){
		//todo - outlier elimination?
		var ret = {
			maxX: pointArray[0][0],
			maxY: pointArray[0][1],
			minX: pointArray[0][0],
			minY: pointArray[0][1]
		}

		for(var i = 1; i < pointArray.length; i++){
			var point = pointArray[i]
			ret.maxX = Math.max(ret.maxX, point[0])
			ret.minX = Math.min(ret.minX, point[0])
			ret.maxY = Math.max(ret.maxY, point[1])
			ret.minY = Math.min(ret.minY, point[1])
		}

		var verticalMarginRatio = 0.10
		var upperVerticalRatio = 0.3//because the model does not include the top of the head

		var horizontalMarginRatio = 0.025

		var verticalRange = ret.maxY - ret.minY
		var horizontalRange = ret.maxX - ret.minX

		var verticalMargin = verticalMarginRatio * verticalRange
		var horizontalMargin = horizontalMarginRatio * horizontalRange

		ret.maxX += horizontalMargin
		ret.minX -= horizontalMargin

		ret.maxY += verticalMargin 
		ret.minY -= verticalMargin + verticalMarginRatio * verticalRange

		ret.width = ret.maxX - ret.minX
		ret.height = ret.maxY - ret.minY

		return ret


	}

	function makeCircle(boundingBox){

		var center = [boundingBox.minX + boundingBox.width / 2, boundingBox.minY + boundingBox.height / 2]
		var radius = Math.pow(boundingBox.height * boundingBox.height + boundingBox.width * boundingBox.width, 1/2) / 2

		return {
			center: center,
			radius: radius
		}
	}

	function drawCircle(context, center, radius){
		context.beginPath()

		context.arc(center[0], center[1], radius, 0, 2 * Math.PI)

		context.fill()
	}

	function makeEmoji(name, src, weights){
		var emoji = {
			name: name,
			src: src,
			weights: weights.slice(0)
		}

		var source = new Image()
		source.src = src

		emoji.source = source

		source.onload = function(){
			emoji.source = source
			globalSource = source
		}

		return emoji

	}

	function drawEmoji(context, center, radius, emojiSource){
		try{
			context.drawImage(emojiSource, center[0] - radius, center[1] - radius, radius * 2, radius * 2)
		} catch(e){
			console.log(e)
			console.log(emojiSource)
		}
	}

	var emojis = []
	var base = 0.25
	var treble = 0.55
	var moreTrebleScalar = 1.3
	var moreBaseScalar = 1.2
	var extraTreble = Math.min(treble * moreTrebleScalar, 0.9)
	var extraBase = base * moreBaseScalar
	var imageUrl = "./img/"

	emojis.push(makeEmoji("neutral", imageUrl + "neutral.svg", [base, base, base, base]))

	emojis.push(makeEmoji("angry", imageUrl + "angry.svg", [treble, base, base, base]))
	emojis.push(makeEmoji("sad", imageUrl + "crying.svg", [base, treble, base, base]))
	emojis.push(makeEmoji("surprised", imageUrl + "surprised.svg", [base, base, treble, base]))
	emojis.push(makeEmoji("happy", imageUrl + "smiling.svg", [base, base, base, treble]))

	emojis.push(makeEmoji("very angry", imageUrl + "more-angry.svg", [extraTreble, extraBase, extraBase, extraBase]))
	emojis.push(makeEmoji("very sad", imageUrl + "more-crying.svg", [extraBase, extraTreble, extraBase, extraBase]))
	emojis.push(makeEmoji("very surprised", imageUrl + "more-surprised.svg", [extraBase, extraBase, extraTreble, extraBase]))
	emojis.push(makeEmoji("very happy", imageUrl + "more-smiling.svg", [extraBase, extraBase, extraBase, extraTreble]))


	function calculateDistanceSquared(weightArray, emojiWeightArray){
		var d = 0;

		for(var i = 0; i < weightArray.length; i++)
			d += Math.pow(weightArray[i] - emojiWeightArray[i], 2)

		return d
	}

	function calculateEmoji(weightArray){
		var bestDistanceSquared = calculateDistanceSquared(weightArray, emojis[0].weights)
		var bestEmojiIndex = 0
		for(var i = 1; i < emojis.length; i++){
			var distanceSquared = calculateDistanceSquared(weightArray, emojis[i].weights)
			if(distanceSquared < bestDistanceSquared){
				bestEmojiIndex = i
				bestDistanceSquared = distanceSquared
			}
		}

		return emojis[bestEmojiIndex]

	}


	function toWeightArray(er){
		var ret = []
		er.forEach(function(e){
			ret.push(e.value)
		})
		return ret
	}

	function drawLoop() {
		requestAnimFrame(drawLoop);
		overlayCC.clearRect(0, 0, 400, 300);
		overlayCC.drawImage(vid, 0, 0, overlay.width, overlay.height);
		if (ctrack.getCurrentPosition()) {
			var positions = ctrack.getCurrentPosition()
			
			var boundingBox = computeBoundingBox(positions)

			var circleDetails = makeCircle(boundingBox)




			var cp = ctrack.getCurrentParameters();
			
			var er = ec.meanPredict(cp);//tracks the emotion values
			
			//[angry, sad, surprised, happy]
			if (er) {
				var weightArray = toWeightArray(er)
				lastWeightArray = weightArray
				var emoji = calculateEmoji(weightArray)
				drawEmoji(overlayCC, circleDetails.center, circleDetails.radius, emoji.source)
			}


		}

	}

	var ec = new emotionClassifier();
	ec.init(emotionModel);
	var emotionData = ec.getBlank();	
