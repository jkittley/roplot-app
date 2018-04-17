/**
 * Created by jacob on 20/06/2016.
 */
window.roplot = (function (window, $) {

    // ----------------------------------------------------
    // Globals
    // ----------------------------------------------------

    var rootElem = null;
    var config = {
        "rotationSpeed": 10,
        "beltSpeed": 10,
        "physical": {
            "radius": 500,
            "drawStart": 100,
            "drawEnd": 450,
            "boomOverhang": 10,
            "pens": [{
                "id": 1,
                "pole": "north",
                "color": "red",
                "offsetX": 15,
            },{
                "id": 2,
                "pole": "south",
                "color": "blue",
                "offsetX": -15,
            }]
        },
        "scaled": {},
        "drawing": {
            "radius": null,
            "ox": null,
            "oy": null,
            "padding": 10,
        }
    };

    var svg = null;
    var boom = null;
    var boomAngle = 0;
    var north = null;
    var south = null;

    var jobs = []
    var job_id = 0;
    var selectedPen = null;

    // ----------------------------------------------------
    // Belt Position
    // ----------------------------------------------------
    
    var physicalBeltPos = null;

    var getBeltPosition = function(scaled=false) {
        if (physicalBeltPos === null) setBeltPosition(config.physical.drawStart);
        if (scaled) return scale(physicalBeltPos);
        return physicalBeltPos;
    }

    var setBeltPosition = function(value, is_scaled=false) {
        if (is_scaled) { 
            physicalBeltPos = scale(value);
        } else {
            physicalBeltPos = value;
        }
    }

    // ----------------------------------------------------
    // Helpers
    // ----------------------------------------------------
    
    var log = function() {
        var msg = "";
        for (x in arguments) msg += " "+arguments[x];
        $('#log ul').append('<li>'+msg+'</li>');
        $('#log .panel-scroller').scrollTop($('#log ul').height());
        console.log(arguments);
    };

    

    // Take an xy from top left and convert to a point from center of circle
    var pointTransform = function(x,y) {
        var off_x = x - config.drawing.radius;
        var off_y = config.drawing.radius - y;
        var off_c = Math.sqrt( Math.abs(off_x * off_x) + Math.abs(off_y * off_y) );
        var radians = 0;
        if      (off_x>=0 && off_y>=0) { radians = Math.asin(off_x / off_c);  }
        else if (off_x>=0 && off_y<0)  { radians = Math.PI/2 + Math.asin(Math.abs(off_y) / off_c);  }
        else if (off_x<0  && off_y<0)  { radians = Math.PI + Math.asin(Math.abs(off_x) / off_c);  }
        else                           { radians = Math.PI*1.5 + Math.asin(off_y / off_c);  }
        if (isNaN(radians)) radians = 0;
        var degrees = radianToDegree(radians);
        return { d: degrees, r: radians, h: off_c / config.drawing.radius, new_x: off_x, new_y: off_y, original_x: x, original_y: y };
    };

    var maxTravel = function() {
        var max_belt_pos = 0;
        for (i in config.carriagePairs) {
            var x = config.carriagePairs[i].virtualBeltpos;
            if (max_belt_pos < x) max_belt_pos = x;
        }
        return config.scaled.drawEnd - max_belt_pos;
    };

    var degreeToRadian = function (degrees) {
        return Math.PI/180 * degrees;
    };

    var radianToDegree = function (radians) {
         return 180/Math.PI * radians;
    };

    // ----------------------------------------------------
    // Boom
    // ----------------------------------------------------

    var animateBoom = function(to_angle, cb=null) {
        // Swing it baby
        boom.transition()
            .duration(function () {
                var distance = Math.max(boomAngle, to_angle) - Math.min(boomAngle, to_angle);
                return config.rotationSpeed * distance;
            })
            .attrTween("transform", function() {
                return d3.interpolateString("rotate("+boomAngle+", "+config.drawing.ox+", "+config.drawing.ox+")", "rotate("+to_angle+", "+config.drawing.oy+", "+config.drawing.oy+")");
            })
            .each("end", function () {
                if (cb) cb();
                $('.stat-angle').html('Angle: '+Math.round(boomAngle)+"&deg;");
            });
    };


    var rotateBoom = function(abs_angle, cb, force_dir) {
        // Make sure its a number
        abs_angle = abs_angle * 1;
        // Is the boom already at the angle
        if (abs_angle===boomAngle) {
            log("Already at angle ", abs_angle);
            if (cb) cb();
            return;
        }

        var CW  = 1;
        var CCW = -1;
        var is_forced = false;
        if (typeof force_dir !==undefined) { is_forced = true; }

        // Calc different distances
        var dir = (abs_angle > boomAngle) ? CW : CCW;
        var diff_cw=0, diff_ccw=0;
        if (dir===CW) {
            diff_cw  = Math.abs(abs_angle - boomAngle);
            diff_ccw = 360 - Math.abs(abs_angle - boomAngle);
        } else {
            diff_cw = 360 - Math.abs(abs_angle - boomAngle);
            diff_ccw  = Math.abs(abs_angle - boomAngle);
        }
        log("Route lengths: CCW",Math.round(diff_ccw), " - CW", Math.round(diff_cw));

        // Workout shortest direction of travel
        var auto_dir = 0;
        if (diff_ccw > diff_cw) {
            log("Shortest route is clockwise");
            auto_dir = 1;
        } else {
            log("Shortest route is anticlockwise");
            auto_dir = -1;
        }

        var move_cw  = boomAngle + diff_cw % 360;
        var move_ccw = boomAngle - diff_ccw;

        var to_angle = abs_angle;
        if (is_forced && force_dir===CW) {
            log("Forcing direction CW");
            to_angle = move_cw
        } else if (is_forced && force_dir===CCW) {
            log("Forcing direction CCW");
            to_angle = move_ccw
        } else if (auto_dir===CW) {
            to_angle = move_cw
        } else {
            to_angle = move_ccw
        }

        log("Rotating from: ",Math.round(boomAngle), " to: ", Math.round(abs_angle), " moving: ", Math.round(to_angle));
       
        animateBoom(to_angle, function() {
            boomAngle = abs_angle;
        });
    };

    // ----------------------------------------------------
    // Carriages
    // ----------------------------------------------------

    var moveCarriages = function(newPhysicalBeltPossition, cb=null) {
        log("Carriages to new belt position:", newPhysicalBeltPossition);
        // Check if within draw limits
        if (newPhysicalBeltPossition > config.physical.drawEnd)   { log("Greater than draw space"); if(cb) cb(false); return; }
        if (newPhysicalBeltPossition < config.physical.drawStart) { log("Less than draw space");    if(cb) cb(false); return; }
        // Position from center to move to
        var from_start = Math.abs(config.physical.drawStart - newPhysicalBeltPossition);
        log("Belt needs to move", from_start);

        // Direction of travel
        var direction_of_travel = (from_start > newPhysicalBeltPossition) ? direction_of_travel = 1 : -1;
        
        animateCarriages(direction_of_travel, from_start, function() {
            setBeltPosition(from_start, false);
        });
    }    
    
    var animateCarriages = function(direction_of_travel, from_start, cb=null) {
        // Animate belt moving
        var dur = function () {
            var distance =  Math.abs(scale(from_start) - getBeltPosition(true));
            console.log(distance);
            return config.beltSpeed * distance;
        };
        north.transition()
            .duration(dur)
            .attr("transform", "translate(0, "+(direction_of_travel * scale(from_start))+")");
        south.transition()
            .duration(dur)
            .attr("transform", "translate(0, "+(-direction_of_travel * scale(from_start))+")");
        if (cb) cb();
    };

    // ----------------------------------------------------
    // Job
    // ----------------------------------------------------

    // Add point to drawing tasks
    var addJob = function(x, y) {

        // Without offset this is where the boom goes
        var mark = pointTransform(x, y);
        // Load selected pen
        var xoffset = 0;
        var yoffset = 0;

        if (selectedPen!==null) {
            var q = Math.floor(mark.d / 90 % 90);
            var t = mark.r - ((Math.PI / 2) * q);
            t = Math.PI/2 - t;
            if (q === 0) {
                yoffset = Math.cos(t) * selectedPen.offsetX;
            } else if (q === 2) {
                xoffset = - Math.sin(t) * selectedPen.offsetX;
                yoffset = - Math.cos(t) * selectedPen.offsetX;
            } else if (q === 1) {
                xoffset = - Math.cos(t) * selectedPen.offsetX;
                yoffset = Math.sin(t) * selectedPen.offsetX;
            } else if (q === 3) {
                xoffset = Math.cos(t) * selectedPen.offsetX;
                yoffset = - Math.sin(t) * selectedPen.offsetX;
            }
            if (selectedPen.pole==="south") {
                xoffset = -1 * xoffset;
                yoffset = -1 * yoffset;
            }
            svg.append('circle')
                .attr('r', 4)
                .attr('cx', scale(x+xoffset))
                .attr('cy', scale(y+yoffset))
                .attr('fill', 'yellow');
        }

        // Create Job
        var job = pointTransform(x+xoffset, y+yoffset);
        job.id  = job_id;
        job.pen = selectedPen;
        jobs.push(job);
        job_id++;
        
        // Draw marker on surface
        if (selectedPen!==null) {
            svg.append('circle')
                .attr('r', 4)
                .attr('cx', mark.original_x)
                .attr('cy', mark.original_y)
                .attr('fill', selectedPen.color)
                .attr('class', 'marker-' + (jobs.length - 1));
        } else {
            svg.append('rect')
              .attr('x', mark.original_x-5)
              .attr('y', mark.original_y-1)
              .attr('width', 10)
              .attr('height', 2)
              .attr('fill', 'grey')
              .attr('class', 'marker-' + (jobs.length - 1));
            svg.append('rect')
              .attr('x', mark.original_x-1)
              .attr('y', mark.original_y-5)
              .attr('width', 2)
              .attr('height', 10)
              .attr('fill', 'grey')
              .attr('class', 'marker-' + (jobs.length - 1));
        }

        updateJobsList();
    };

    // Draw the jobs list
    var updateJobsList = function() {
        var jobList = $('#job_list ul');
        jobList.html('');
        $.each(jobs, function (k,v) {
            var li = $('<li></li>')
                .addClass("list-group-item");
                var html  = '<div class="row">';
                    html += ' <div class="col-md-3"><i class="fa fa-compass" aria-hidden="true"></i> '+Math.round(v.d)+'&deg; ';
                    html += ' </div>';
                    html += ' <div class="col-md-3"><i class="fa fa-arrows-h" aria-hidden="true"></i> '+Math.round(v.h*config.scaled.radius)+';'
                    html += ' </div>';
                    html += ' <div class="col-md-4"><i class="fa fa-pencil" aria-hidden="true"></i> '+((v.pen !==null) ?  v.pen.pole+" "+v.pen.color : 'None');
                    html += ' </div>';
                    html += '</div>';
                li.html(html);
            if (v.hasOwnProperty('complete')) li.addClass('complete');
            jobList.append(li);
        });
    };

    var getNextJob = function () {
        if (jobs.length === 0) return null;
        return jobs.pop();
    };

    var execNextJob = function() {
        var nextJob = getNextJob();
        if (nextJob!==null) execJob(nextJob);
    };

    var execAllJobs = function() {
        // if (emergencyStop) {
        //         emergencyStop = false;
        //         log("Emergency Stop Applied");
        //         $('.consumeStop').prop('disabled', true);
        //         $('.consume-button').prop('disabled',false);
        //         return;
        // }

        // var nextJob = getNextJob();
        // if (nextJob!==null) {
        //     $('.consumeStop').prop('disabled', false);
        //     setTimeout(function() {
        //         execJob(nextJob, execAllJobs)
        //     },1000);
        // } else {
        //     $('.consumeStop').prop('disabled', true);
        // }
    };

    var execJob = function(job, cb) {
        // Disable consume buttons
        $('.consume-button').prop('disabled', true);
        log('Executing Job: ', job.id);
        updateJobsList();
        sendJob(job);
    };

    // Send job to harware
    var sendJob = function(job) {
        // Hack
        job.complete = true;
        receiveJobUpdate(job);
    }

    // Receive update from hardware
    var receiveJobUpdate = function(job) {
        // Hack
        if (job.complete) jobComplete(job);
    }

    var jobComplete = function(job) {
        log("Job complete", job);
        $('.consume-button').prop('disabled', false);
    }
    

    var removeJob = function(jobIndex) {
        // Remove marker on canvas
        $('.marker-' + jobIndex).remove();
        jobs[jobIndex].complete = true;
        updateJobsList();
    };

    // ----------------------------------------------------
    // Pens
    // ----------------------------------------------------

    var updatePensList = function() {
        var hasPenSelected = false;
        var penList = $('#pen_list ul');
        // Wipe clean
        penList.html('');
        // None button
        var unset = $('<li>No Pen</li>')
                    .attr('class', 'pen-unset list-group-item')
                    .on('click', unSetPen);
        
        penList.append(unset);
        // Carriage titles
        $.each(config.physical.pens, function (k, pen) {
            var tmp = $('<li></li>')
                .attr('class', 'list-group-item pen-button')
                .attr('data-pen-id', ""+pen.id)
                .html(pen.pole+' '+pen.color)
                .on("click", function() { setPen(pen.id); });
            if (pen.id===selectedPen) {
                hasPenSelected = true;
                tmp.attr('class', tmp.attr('class') + ' selected');
            }
                penList.append(tmp);
        });
        if (!hasPenSelected) unset.attr('class', unset.attr('class') + ' selected');
    };

    var unSetPen = function() {
        log("Unset Pen");
        selectedPen = null;
        $('.pen-button').removeClass('selected');
        $('.pen-unset').addClass('selected');
    };

    var setPen = function (pen_id) {
        log("Set Pen", pen_id);
        selectedPen = getPen(pen_id);
        $('.pen-button').removeClass('selected');
        $('.pen-unset').removeClass('selected');
        $('.pen-button[data-pen-id="' + pen_id + '"]').addClass('selected');
        console.log($('.pen-button[data-pen-id="' + pen_id + '"]'));
    };

    var getPen = function (pen_id) {
        for (i in config.physical.pens) {
            if (config.physical.pens[i].id ==  pen_id) return config.physical.pens[i];
        }
        return null;
    };

    // ----------------------------------------------------
    // Build
    // ----------------------------------------------------

    var buildSurface = function(svg) {

        svg.append("circle")
            .attr("r", config.drawing.radius)
            .attr("cx", config.drawing.ox)
            .attr("cy", config.drawing.oy)
            .attr("class", 'draw-surface');

        svg.append("circle")
            .attr("r", 10)
            .attr("cx", config.drawing.ox)
            .attr("cy", config.drawing.oy)
            .attr("class", 'hub');

        // Mark drawable area
        var arc = d3.svg.arc()
            .innerRadius(config.scaled.drawStart)
            .outerRadius(config.scaled.drawEnd)
            .startAngle(0)
            .endAngle(2 * Math.PI);
        svg.append("path")
            .attr("d", arc)
            .attr("class", "draw-zones")
            .attr("transform", "translate("+config.drawing.ox+","+config.drawing.oy+")");

        for (i in config.carriagePairs) {
            svg.append("circle")
            .attr("r", config.scaled.drawStart + config.carriagePairs[i].virtualBeltpos)
            .attr("cx", config.drawing.ox)
            .attr("cy", config.drawing.oy)
            .attr("class", 'beltpos-ring');
        }


        var face = svg.append('g')
		    .attr('id','clock-face')
            .attr('transform','translate(' + config.drawing.ox + ',' + config.drawing.oy + ')');
	    face.selectAll('.degree-tick')
		.data(d3.range(0,360/5)).enter()
			.append('line')
			.attr('class', 'degree-tick')
			.attr('x1',0)
			.attr('x2',0)
			.attr('y1',config.drawing.radius)
			.attr('y2',config.drawing.radius-5)
			.attr('transform',function(d){
				return 'rotate(' + d * 5 + ')';
			});
        var radian = Math.PI / 180;
        var interval = 15;
        var labelradius = config.drawing.radius - 20;
        face.selectAll('.degree-label')
		    .data(d3.range(0,360/interval))
			.enter()
			.append('text')
			.attr('class', 'degree-label')
			.attr('text-anchor','middle')
			.attr('x',function(d){
				return labelradius * Math.sin(d*interval*radian);
			})
			.attr('y',function(d){
				return -labelradius * Math.cos(d*interval*radian);
			})
            .attr('dy', ".35em")
			.text(function(d){
				return d*interval;
			});
    };

    var buildBoom = function (svg) {
        boom = svg.append("g")
            .attr('id', 'boom');

        var boomLength = config.scaled.drawEnd + config.scaled.boomOverhang;

        boom.append("line")
            .attr("x1", config.drawing.ox)
            .attr("y1", config.drawing.oy - boomLength)
            .attr("x2", config.drawing.ox)
            .attr("y2", config.drawing.oy + boomLength)
            .attr("stroke-width", 2)
            .style("stroke", 'black');

        poly = [config.drawing.ox+", "+(config.drawing.oy-boomLength),
                (config.drawing.ox-5)+", "+(config.drawing.oy-boomLength+10),
                (config.drawing.ox+5)+", "+(config.drawing.oy-boomLength+10)
        ];

        boom.append("polygon")
            .attr("points", function() { return poly.join(" ") })
            .attr("stroke","black")
            .attr("stroke-width",2);
    };

    var buildCarriages = function (svg) {
        var carriages = boom.append("g")
            .attr("id", "carriages");

        // Great groups for north and south
        north = carriages.append("g").attr("id","north-belt");
        south = carriages.append("g").attr("id","south-belt");

        north.append("circle")
            .attr('class', 'carriage')
            .attr("r", 5)
            .attr("cx", config.drawing.ox)
            .attr("cy", function () {
                return config.drawing.oy - config.scaled.drawStart;
            });

        south.append("circle")
            .attr('class', 'carriage')
            .attr("r", 5)
            .attr("cx", config.drawing.ox)
            .attr("cy", function () {
                return config.drawing.oy + config.scaled.drawStart;
            });

        // Add pens
        for (i in config.physical.pens) {
            var pen  = config.physical.pens[i];
            var pole = (pen.pole === 'north') ? north : south;

            // Pens
            pen.circle = pole.append("circle")
                .attr('class', 'pen')
                .attr("r", 5)
                .attr("cx", config.drawing.ox - scale(pen.offsetX))
                .attr("cy", function() {
                    var offset = getBeltPosition(true);
                    if (pole===north) return config.drawing.oy - offset; else return config.drawing.oy + offset;
                })
                .style("fill", pen.color);
        }
    };

    var buildClickLayer = function(svg) {
        var mouseLine = svg.append("line")
            .attr("x1", config.drawing.ox)
            .attr("y1", config.drawing.oy)
            .attr("x2", config.drawing.ox)
            .attr("y2", config.drawing.oy)
            .attr("class", "mouse-line");
        svg.append("circle")
            .attr("r", config.drawing.radius)
            .attr("cx", config.drawing.ox)
            .attr("cy", config.drawing.oy)
            .style("fill", 'transparent')
            .on("mousemove", function () {
                var point = d3.mouse(this);
                mouseLine.attr("x2", point[0]).attr("y2", point[1]);
                d3.event.stopPropagation();
            })
            .on("mouseout", function () {
                mouseLine.attr("x2", config.drawing.ox).attr("y2", config.drawing.oy);
                d3.event.stopPropagation();
            })
            .on("click", function () {
                var point = d3.mouse(this);
                addJob(point[0], point[1]);
                d3.event.stopPropagation();
            });
    };

    var buildStats = function(svg) {
        svg.append('text')
         .attr("x", 10)
         .attr("y", 20)
         .text("")
         .attr("class", "stat stat-angle");
    };

    // ----------------------------------------------------
    // Config
    // ----------------------------------------------------

    var scale = function (value) {
        var a = Math.max(1 * config.physical.radius, 1 * config.drawing.radius);
        var b = Math.min(1 * config.physical.radius, 1 * config.drawing.radius);
        return b / a * value;
    };

    var updConfig = function(new_settings) {
        $.extend(true, config, new_settings);
        for (x in config.physical) {
            config.scaled[x] = scale(config.physical[x]);
        }
        console.log(config);
    }

    // ----------------------------------------------------
    // Main
    // ----------------------------------------------------

    var init = function(elem, device_config) {
        rootElem = $('#'+elem);
        config.drawing.radius = Math.min(rootElem.width()-config.drawing.padding*2, rootElem.height()-config.drawing.padding*2) / 2;
        config.drawing.ox = config.drawing.radius;
        config.drawing.oy = config.drawing.radius;

        // for (x in config.carriagePairs) {
        //     config.carriagePairs[x].virtualBeltpos = scaleToVirtual(config.carriagePairs[x].beltpos, config.physical.radius);
        //     for (p in config.carriagePairs[x].pens) {
        //         config.carriagePairs[x].pens[p].virtualXOffset = scaleToVirtual(config.carriagePairs[x].pens[p].xoffset, config.physical.radius);
        //     }
        // }
        


        updConfig(device_config);
        
        console.log([config.drawing.radius]);

        svg = d3.select("#"+elem).append("svg")
            .attr("width", config.drawing.radius * 2)
            .attr("height", config.drawing.radius * 2);

        buildSurface(svg);
        buildBoom(svg);
        buildCarriages(svg);
        buildClickLayer(svg);
        updatePensList();

        d3.select(".consumeOne").on("click", function() {  execNextJob();  });
        d3.select(".consumeAll").on("click", function() {  execAllJobs();  });
        d3.select(".consumeStop").on("click", function() { emergencyStop = true;  });

    };

    return {
        init: init,
        boomTo: rotateBoom,
        carTo: moveCarriages
    }
})(window, $);