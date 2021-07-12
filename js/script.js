var canvas, ctx, source, context, analyser, fbc_array, rads,
    center_x, center_y, radius, radius_old, deltarad, shockwave,
    bars, bar_x, bar_y, bar_x_term, bar_y_term, bar_width,
    bar_height, react_x, react_y, intensity, rot, audio, pause, title, isSeeking;

bars = 200;
react_x = 0;
react_y = 0;
radius = 0;
deltarad = 0;
shockwave = 0;
rot = 0;
intensity = 0;
pause = 1;
isSeeking = 0;
var volume = 0.4;
var mp3s = [
    {file: 'allTheTime', name: 'Zara Larsson - All the Time (Don Diablo Remix - Official Audio)'},
    {file: 'supersmash', name: 'SUPER SMASH BROS BRAWL DRILL REMIX BY SHAE OT'}, // 1
    {file: 'Armin_LYH', name: 'Armin van Buuren - Lifting You Higher'},
    {file: 'Don Diablo - Momentum', name: 'Don Diablo - Momentum'},
    {file: 'RASPUTIN', name: 'RASPUTIN - Vladimir Putin - Love The Way You Move (Funk Overload)'}, // 4
    {file: 'free', name: 'TWOLOUD & MureKian - Free'},
    {file: 'House You', name: 'Don Diablo - I will House You ft. Jungle Brothers'},
    {file: 'Stonebank1', name: 'Stonebank - Be Alright (feat. EMEL) (Au5 Remix) [Monstercat Release]'},
    {file: 'au5', name: 'Au5 - Snowblind (feat. Tasha Baxter) (Darren Styles Remix) [Monstercat Release]'}, //*
    {file: 'Darrenstyles', name: 'Darren Styles - Us Against The World (Protostar Remix) [Monstercat Release]'}, //
    {file: 'infinitepower', name: 'TheFatRat - Infinite Power!'},
    {file: 'Pentakill', name: 'Different Heaven - Pentakill (feat. ReesaLunn)'},
    {file: 'andiamo', name: 'Fabio Rovazzi - Andiamo A Comandare'}, //
    {file: 'Alok', name: 'Alok VIZE - Love Again'},
    {file: 'hardbass', name: 'Hard Bass School - narkotik kal'}, // 14
    {file: 'higher', name: 'Ummet Ozcan x Lucas  Steve - Higher'}, //
    {file: 'virus', name: 'Martin Garrix & MOTi - Virus'}, // 17
    {file: 'Prismo', name: 'TEXT'},  // 18
    {file: 'Hellberg', name: 'TEXT'},  // 18
    {file: 'Halsey', name: 'TEXT'},  // 18
    {file: 'INZO', name: 'TEXT'},  // 18

];

/*
function getDevice() {

    var dev = document.getElementById("dev");

    if (window.outerWidth > 550)
    {
        return "Mobile";
    }
    if (window.outerWidth < 1199 && window.outerWidth < 551)
    {
        return "Tablet";
    }
    if (window.outerWidth > 1200)
    {
        return "PC";
    }

}
*/

function getMobileOperatingSystem() {
    var userAgent = navigator.userAgent || navigator.vendor || window.opera;

    // Windows Phone must come first because its UA also contains "Android"
    if (/windows phone/i.test(userAgent)) {
        return "Windows Phone";
    }

    if (/android/i.test(userAgent)) {
        return "Android";
    }

    // iOS detection from: http://stackoverflow.com/a/9039885/177710
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
        return "iOS";
    }

    return "unknown";
}

var songindex = Math.floor(Math.random() * (mp3s.length - 1));

/**
 * EFFECTS SECTION 
 */

 function songIndex(i) {
    $("#subtopewds").hide();
    if (i === 4 || i === 14)
        return "russian.png";
    else if (i === 16)
        return "virus.png";
    else
        return "logo.png";
}

var context;

function initPage() {
    canvas = document.getElementById("visualizer_render");
    ctx = canvas.getContext("2d");

    //resize_canvas();

    audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.controls = true;
    audio.loop = false;
    audio.autoplay = false;

    audio.addEventListener("ended", function () {
        if (mp3s.length - 1 == songindex) songindex = 0;
        else songindex = songindex + 1;
        img.src = songIndex(songindex);
        initMp3Player();
    });
}

var os = getMobileOperatingSystem();

function resize_canvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

$(window).on('load', function () {
    $('#preloader').delay(750).fadeOut('fast');
    setTimeout(function () {
        initPage();
        if (os === "Android" || os === "iOS" || os === "Windows Phone") {
            $("#androidWarn .os").html(os);
            $("#androidWarn").show();
        } else {
            initMp3Player();
            demo.start();
        }
    }, 750);/*
    $(document).on("contextmenu", function (e) {
        alert(":)");
        e.preventDefault();
    });
    $(document).keydown(function (event) {
        if (event.keyCode == 123) {
            alert(":P");
            return false;
        } else if (event.ctrlKey && event.shiftKey && event.keyCode == 73) {
            alert(":O");
            return false;
        } else if (event.ctrlKey && event.shiftKey && event.keyCode == 74) {
            alert(":/");
            return false;
        } else if (event.ctrlKey && event.keyCode == 85) {
            alert("<3");
            return false;
        }
    });*/
});

$(document).ready(function () {
    $("#volume input").val(volume * 100);  
    $(".fa-volume-up").click(function () {

        if (audio.volume === 0) {
            document.getElementById('volume').style.opacity = 1;
            audio.volume = 0.5;
        }
        else {
            document.getElementById('volume').style.opacity = 0.5;
            audio.volume = 0;
        }
    });

    for (let e of document.querySelectorAll('input[type="range"].slider-progress')) {
        e.style.setProperty('--value', e.value);
        e.style.setProperty('--min', e.min == '' ? '0' : e.min);
        e.style.setProperty('--max', e.max == '' ? '100' : e.max);
        e.addEventListener('input', () => e.style.setProperty('--value', e.value));
      }

    $("#androidWarn .fuckit").click(function () {
        $("#androidWarn").fadeOut();
        initMp3Player();
    });


    $(".fa-step-forward").click(function () {
        if (mp3s.length - 1 == songindex) songindex = 0;
        else songindex = songindex + 1;
        img.src = songIndex(songindex);
        initMp3Player();
    });
    

    $('#volume input[type=range]').on('input', function () {
        if (document.getElementById('volume').style.opacity < 1) {
            document.getElementById('volume').style.opacity = 1;
        }
            audio.volume = $(this).val() / 100;
            volume = $(this).val() / 100;
        
    });


    /*

    $("#title, .modal-close").click(function () {
        if ($("#myModal").hasClass("open")) {
            $('#myModal').slideUp("slow").removeClass("open");
            $('#visualizer_render').fadeTo("slow", 1);
        } else {
            $('#myModal').slideDown("slow").addClass("open");
            $('#visualizer_render').fadeTo("slow", 0.25);
        }
    });

    $('#title').on('click touchend', function (e) {
        if (e.type == 'click')
            return;
        else
            $('#myModal .scrollable').css("margin-right", "0");
    });
    */
/*
        console.clear();
        console.meme("Not sure if you need", "to be here", "Not Sure Fry");
        setTimeout(function () {
            console.meme("Console is for developers", "not for you", "Chemistry Cat");
            setTimeout(function () {
                console.meme("Really fuck off or", "i will die", "Advice Dog");
                setTimeout(function () {
                    console.clear();
                }, 1900);
            }, 2000);
        }, 2000);
        */
/*
       setInterval(function () {
            console.meme("Not sure if you need", "to be here", "Not Sure Fry");
            setTimeout(function () {
                console.meme("Console is for developers", "not for you", "Chemistry Cat");
                setTimeout(function () {
                    console.meme("Really fuck off or", "i will die", "Advice Dog");
                    setTimeout(function () {
                        console.clear();
                    }, 1900);
                }, 2000);
            }, 2000);
        }, 6000);*/
});


function initMp3Player(first = false) {

	if(!context){
		try {
			context = new AudioContext();
			analyser = context.createAnalyser();
			source = context.createMediaElementSource(audio);
			source.connect(analyser);
			analyser.connect(context.destination);
			fbc_array = new Uint8Array(analyser.frequencyBinCount);
			frameLooper();
		} catch (err) {
			console.log(err);
			showPlay();
		}
	} else{
		context.resume();
	}

    $("#pushme").fadeOut();
    $("#visualizer_render").fadeIn();

    audio.src = "mp3s/" + mp3s[songindex]['file'] + ".mp3";

    $("#controls .name span").html(mp3s[songindex]['name']);
    pause = 0;
    audio.play().catch(function (err) {
        console.log(err);
        showPlay();
    });
    audio.volume = volume;
}

function showPlay() {
    $("#visualizer_render").fadeOut();
    $("#pushme").fadeIn();
}

var img = new Image();
if (window.location.search.indexOf('hardbass') > -1)
    songindex = 13;
if (window.location.search.indexOf('putin') > -1)
    songindex = 3;
if (window.location.search.indexOf('virus') > -1)
    songindex = mp3s.length - 1;
img.src = songIndex(songindex);

function frameLooper() {

    resize_canvas();

    var grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "rgba(0, 0, 0, 0)"); //background
    grd.addColorStop(1, "rgba(0, 0, 0, 0)"); //background

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);


    ctx.fillStyle = "rgba(255, 255, 255, " + (intensity * 0.0000125 - 0.55) + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    rot = rot + intensity * 0.0000001;

    react_x = 0;
    react_y = 0;

    intensity = 0;

    analyser.getByteFrequencyData(fbc_array);


    for (var i = 5; i < bars; i++) {
        rads = Math.PI * 2 / (bars - 5);

        if (i < 10) {
            fbc_array[i] = fbc_array[i] / 1.2;
        }

        bar_x = center_x;
        bar_y = center_y;

        bar_height = Math.min(99999, Math.max((fbc_array[i] * 2.5 - 250), 0));
        bar_width = bar_height * 0.03;

        bar_x_term = center_x + Math.cos(rads * i + rot) * (radius + bar_height);
        bar_y_term = center_y + Math.sin(rads * i + rot) * (radius + bar_height);

        ctx.save();


        /* RUSSIAN SECTION - EFFECTS */
        if (songindex === 4 || songindex === 14)
           {
            if (Math.sin(rads * i - rot) > -0.6 && Math.sin(rads * i - rot) < 0.5)   
            {
                ctx.strokeStyle = "rgba(0, 0, 255, 0.5)";
            }         
            else if(Math.sin(rads * i - rot) < -0.5)
            {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
            }
            else
            {
                ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
            }

           }  
        /* PURPLE SECTION - EFFECTS */
        else if(songindex === 6)
        {
        if (Math.sin(rads * i + rot) > 0.05)  
        {
            ctx.strokeStyle = "rgb(150, 0, 160, 1)";       
        }          
         else
         {
             ctx.strokeStyle = "rgba(255, 0, 255, 0.6)";
         }
        }
         /* VIRUS SECTION - EFFECTS */
        else if(songindex === 16)
        {
        if (Math.sin(rads * i + rot) > 0.05)  
        {
            ctx.strokeStyle = "rgb(0,255,160, 0.5)";       
        }          
         else
         {
             ctx.strokeStyle = "rgba(0,255,160, 0.8)";
         }
        }
        else
        {
            if (Math.sin(rads * i + rot) > 0.05)
            {
                ctx.strokeStyle = "rgba(212, 211, 210, 0.5)";
            }
            else
            {
                //ctx.strokeStyle = "rgb(255,255,255)";
                ctx.strokeStyle = "rgba(212, 211, 210, 0.8)";
            }
        }

        /* OTHER EFFECTS */
       

        ctx.lineWidth = bar_width;
        ctx.beginPath();
        ctx.moveTo(bar_x, bar_y);
        ctx.lineTo(bar_x_term, bar_y_term);
        ctx.stroke();

        react_x += Math.cos(rads * i + rot) * (radius + bar_height);
        react_y += Math.sin(rads * i + rot) * (radius + bar_height);

        intensity += bar_height;
    }

    //center_x = canvas.width / 2 - (react_x * 0.007);
    //center_y = canvas.height / 2 - (react_y * 0.007);

    center_x = canvas.width / 2 - (react_x * 0.002);
    center_y = canvas.height / 2 - (react_x * 0.002) + 60;

    radius_old = radius;
    radius = 50 + (intensity * 0.0005);
    deltarad = radius - radius_old;


    //middle background
    /*ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.beginPath();
    ctx.arc(center_x, center_y, radius + 50, 0, Math.PI * 2, true);
    ctx.fill();*/

    var halfsize = ((radius * 3 + 2) / 2);
    ctx.drawImage(img, center_x - halfsize, center_y - halfsize, radius * 3 + 2, radius * 3 + 2);

    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.closePath();
    ctx.restore();

    // shockwave effect
    shockwave += 50;

    ctx.lineWidth = 15;

    if (songindex === 17 || songindex === 18)
        ctx.strokeStyle = "fff";

    else if (songindex === 6)
    ctx.strokeStyle = "rgb(255, 0, 255, 0.8)"; //shockwave

    else
        ctx.strokeStyle = "rgb(255, 255, 255, 0.5)"; //shockwave
        

    ctx.beginPath();
    ctx.arc(center_x, center_y, shockwave + radius, 0, Math.PI * 2, false);
    ctx.stroke();

    if (deltarad > 5) {
        shockwave = 0;

        ctx.fillStyle = "rgb(255, 255, 255, 1)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        rot = rot + 0.;

        ctx.beginPath();
        ctx.fillStyle = "rgb(255, 255, 255)";
        
    }


    /*if (deltarad > 3) {
        shockwave = 0;
    }*/

    /*if (!isSeeking) {
        document.getElementById("audioTime").value = (100 / audio.duration) * audio.currentTime;
    }


    document.getElementById("time").innerHTML = Math.floor(audio.currentTime / 60) + ":" + (Math.floor(audio.currentTime % 60) < 10 ? "0" : "") + Math.floor(audio.currentTime % 60);
*/


    window.requestAnimationFrame(frameLooper);
}