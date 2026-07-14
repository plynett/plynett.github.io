% Script to create input files needed for WebGPU version of Celeris
% creates config.json, bathy.txt, and waves.txt

clear all
close all
clf

% High-Level Simulation Control Parameters
grid_type = 1; % Cartesian grid. For grid_type=1, Celeris x=0 is the left boundary.
NLSW_or_Bous = 0; % =0 for Nonlinear Shallow Water Solver (long waves only) otherwise Boussinesq (wind waves)
dx = 0.025; % uniform grid size to use in model - the loaded bathy files will be interpolated to this grid size
dy = 0.025;
Courant_num = 0.15; %Target Courant #.  ~0.25 for P-C, ~0.05 for explicit methods. Default: 0.2
isManning = 0; % A boolean friction model value, if==1 "friction" is a Mannnigs n, otherwise it is a dimensionless friction factor (Moody)
friction = 0.0;  % dimensionless friction coefficient, or Mannings "n", depending on isManning choice
min_allowable_depth = 0.000001; % min allowable water depth
infiltrationRate = 0.00;  % infiltration rate - for drying inundated cells
algochanges=1; % 1=use new moving shoreline algorithm

% Benchmark Problem 1 setup
% The benchmark is nondimensional with d=1, H/d=0.019, and a 1:19.85 beach.
% The left boundary is x=0 in Celeris.  The NTHMP benchmark coordinate at
% that same location is x/d=-5, so benchmark x/d values are shifted by +5 m
% when written to Celeris input coordinates.
base_depth = 1.0;
wave_height = 0.019;
benchmark_left_x_over_d = -5.0;
benchmark_right_x_over_d = 90.0;
x_min = 0.0;
x_max = (benchmark_right_x_over_d - benchmark_left_x_over_d)*base_depth;
y_min = 0.0;
y_max = dy*150;
shoreline_x = (0.0 - benchmark_left_x_over_d)*base_depth; % Celeris x for benchmark x/d=0
toe_x = (19.85 - benchmark_left_x_over_d)*base_depth; % Celeris x for benchmark x/d=19.85
beach_slope = 1/19.85;

% Celeris Add Disturbance solitary wave setup.
% BP01, BP04, and BP06 should use this native solitary-wave path, not etaInitCond.txt.
loadetaIC = 0;
add_Disturbance = 1;
disturbanceType = 1;
disturbanceXpos = (38.09755657215425 - benchmark_left_x_over_d)*base_depth; % Celeris x for the benchmark initial solitary wave
disturbanceYpos = 0.375;
disturbanceCrestamp = wave_height;
disturbanceDir = 180; % wave travels toward decreasing x, from offshore to the beach

%  Boundary conditions - at least one of the boundaries should be = 2 for incident waves.
%  BP01 does not use incident-wave forcing; the solitary wave is initialized with Add Disturbance.
west_boundary_type = 0; % west_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, created by spectrum_2D above
east_boundary_type = 1; % east_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, created by spectrum_2D above
south_boundary_type = 0; % south_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, created by spectrum_2D above
north_boundary_type = 0; % north_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, created by spectrum_2D above
BoundaryWidth = 30;
incident_wave_type = -1;
numberOfWaves = 1;

% Time Series Parameters
maxdurationTimeSeries = 24;  % this is the time chunk to display and write discrete parts of the time series
NumberOfTimeSeries = 0;  % the maximum number of time series that can be added is 15
% List time series locations (in Celeris grid coordinates):
xts(1) = (0.25 - benchmark_left_x_over_d)*base_depth;  yts(1) = 0.375; % benchmark x/d=0.25
xts(2) = (9.95 - benchmark_left_x_over_d)*base_depth;  yts(2) = 0.375; % benchmark x/d=9.95
% add additional time series as needed

% Save trigger parameters for automatically saving data, these will be added to json
trigger_animation = 0;  % automation trigger for animated gif when = 1
trigger_animation_start_time = 0.0;  % start time of animation trigger
AnimGif_dt = 0.25;  % time between animated gif frames, will write 80 frames

% Surface output schedule
% tau=sqrt(d/g)=0.3193299568 s. Start one interval before t/tau=35
% so the written surfaces align with t/tau=35,40,45,50,55,60,65,70.
trigger_writesurface = 1;  % automation trigger for writing 2D surfaces when = 1
trigger_writesurface_start_time = 0.0;  % start time of surface write trigger
trigger_writesurface_end_time = 50;  % end time of surface write trigger
dt_writesurface = 0.1;  % increment to write to file
write_eta = 1;  % flag for writing eta surface data to file, write when = 1
write_u = 0;  % flag for writing x velocity surface data to file, write when = 1
write_v = 0;  % flag for writing y velocity surface data to file, write when = 1
write_P = 0;  % flag for writing x flux surface data to file, write when = 1
write_Q = 0;  % flag for writing y flux surface data to file, write when = 1
write_turb = 0;  % flag for writing eddy visc surface data to file, write when = 1

trigger_writeWaveHeight = 1;  % automation trigger for writing mean/max/wave height surfaces when = 1
trigger_resetMeans_time = 0.0;  % time to reset means
trigger_resetWaveHeight_time = 0.0;  % time to reset wave height
trigger_writeWaveHeight_time = trigger_writesurface_end_time - 0.5;  % time to write wave height, this is also the end time for the simulation
which_surface_to_write = 10; % 10 = Max Free Surface Elev
% Note: The simulation will never close if trigger_writeWaveHeight~=1

% Defaults, should not need to change (for other parameters need to change source code
g = 9.80665;  %gravity
Theta = 2.0;  %midmod limiter parameter; empirical breaking parameter. 1.0 most dissipative (upwind) to 2.0 least dissipative (centered) Default: 1.5
dissipation_threshold = 0.3;  %For visualization purposes, represents a characterestic slope at breaking. 0.577=30 degrees, will need to be lower for coarse grid simulations that can not resolve this slope; 0.364=20 deg; 0.2679=15 deg
whiteWaterDecayRate = 0.02; % For visualization purposes, not simulation. Default: 0.9
timeScheme = 2;  %  Time integration choices: 0=Euler, 1=3rd-order A-B predictor, 2= A-B 4th-order predictor+corrector. Default: 2
seaLevel = 0.0;  % water level shift from given datum, for tide, surge, etc
Bcoef = 0.06666667; % dispersion parameter, 1/15 is optimum value for this set of equations. Default: 0.06666666666667
tridiag_solve = 2; % Method to solve the tridiagonal Boussinesq system: =0 Thomas (extremely slow, only for small domains (nx,ny <500) due to thread memory req), =1 Gauss-Sid (very slow), or 2 parallel cyclic reduction (best). Default: 2
surfaceToPlot = 0;
colorMap_choice = 2;
colorVal_min = -0.03;
colorVal_max = 0.10;
ShowLogos = 0;
GoogleMapOverlay = 0;
render_step = 10;
simPause = -1;

% Create bathy/topo surface - this needs to be custom for each scenario -
% see the interpBathy.m script in the directory below to see how the data
% is converted into a model grid
x = [x_min:dx:x_max];
y = [y_min:dy:y_max];
x_benchmark_over_d = x/base_depth + benchmark_left_x_over_d;
h_line = -base_depth*beach_slope*x_benchmark_over_d;
h_line(x_benchmark_over_d > 19.85) = -base_depth;
h_interp = repmat(h_line,length(y),1);

figure(1)
clf
plot(x,h_line,'k-','LineWidth',1.5)
grid on
title('BP01 Bathy/Topo Transect')
xlabel('Celeris x (m)')
ylabel('bottom elevation (m)')

pause(.1)
save bathy.txt h_interp -ascii

WIDTH = length(x); % //WIDTH
HEIGHT = length(y); % //HEIGHT
dx = mean(diff(x));  % //dx
dy = mean(diff(y));  %  //dy

% write a dummy waves file; BP01 uses Add Disturbance, not incident waves
fid = fopen('waves.txt','w');
fprintf(fid,'[NumberOfWaves] 1\n');
fprintf(fid,'=================================\n');
fprintf(fid,'0.0 10.0 0.0 0.0\n');
fclose(fid);

% write sim control data to file
data = [ grid_type, WIDTH, HEIGHT, dx, dy, Courant_num, NLSW_or_Bous, ...
            base_depth, g, Theta, friction, isManning, ...
            dissipation_threshold, whiteWaterDecayRate, timeScheme, ...
            seaLevel*0, Bcoef, tridiag_solve, west_boundary_type, ...
            east_boundary_type, south_boundary_type, north_boundary_type, ...
            BoundaryWidth, incident_wave_type, numberOfWaves, ...
            maxdurationTimeSeries, NumberOfTimeSeries, ...
            loadetaIC, add_Disturbance, disturbanceType, disturbanceXpos, ...
            disturbanceYpos, disturbanceCrestamp, disturbanceDir, ...
            surfaceToPlot, colorMap_choice, colorVal_min, colorVal_max, ...
            ShowLogos, GoogleMapOverlay, render_step, simPause, ...
            trigger_animation, trigger_animation_start_time, AnimGif_dt, ...
            trigger_writesurface, trigger_writesurface_start_time, ...
            trigger_writesurface_end_time, dt_writesurface, infiltrationRate, ...
            write_eta, write_P, write_Q, write_u, write_v, write_turb, ...
            trigger_writeWaveHeight, trigger_resetMeans_time, trigger_resetWaveHeight_time, ...
            trigger_writeWaveHeight_time, which_surface_to_write, min_allowable_depth,algochanges];
varnames = {'grid_type', 'WIDTH', 'HEIGHT', 'dx', 'dy', 'Courant_num', 'NLSW_or_Bous', ...
            'base_depth', 'g', 'Theta', 'friction', 'isManning', ...
            'dissipation_threshold', 'whiteWaterDecayRate', 'timeScheme', ...
            'seaLevel', 'Bcoef', 'tridiag_solve', 'west_boundary_type', ...
            'east_boundary_type', 'south_boundary_type', 'north_boundary_type', ...
            'BoundaryWidth', 'incident_wave_type', 'numberOfWaves', ...
            'maxdurationTimeSeries', 'NumberOfTimeSeries', ...
            'loadetaIC', 'add_Disturbance', 'disturbanceType', 'disturbanceXpos', ...
            'disturbanceYpos', 'disturbanceCrestamp', 'disturbanceDir', ...
            'surfaceToPlot', 'colorMap_choice', 'colorVal_min', 'colorVal_max', ...
            'ShowLogos', 'GoogleMapOverlay', 'render_step', 'simPause', ...
            'trigger_animation', 'trigger_animation_start_time', 'AnimGif_dt', ...
            'trigger_writesurface', 'trigger_writesurface_start_time', ...
            'trigger_writesurface_end_time', 'dt_writesurface', 'infiltrationRate', ...
            'write_eta', 'write_P', 'write_Q', 'write_u', 'write_v', 'write_turb', ...
            'trigger_writeWaveHeight', 'trigger_resetMeans_time', 'trigger_resetWaveHeight_time', ...
            'trigger_writeWaveHeight_time', 'which_surface_to_write', 'min_allowable_depth','algochanges'};

% Open the output file for writing
fid = fopen('config.json', 'w');
fprintf(fid, '{ \n');
% Write the data and variable names to the file
for i = 1:length(data)
    fprintf(fid, '  "%s": %.8f, \n' ,varnames{i} , data(i));
end
% Write time series
% Write each time series location as a JSON object
fprintf(fid, '  "locationOfTimeSeries": [\n');
for k = 1:16 % 16 is a Celeris-WebGPU hard coded limit here, do not change
    if k==1 || k> 1+NumberOfTimeSeries % first slot is reserved for mouse hover tooltip info
        x_c=0.0;
        y_c=0.0;
    else
        x_c=xts(k-1);
        y_c=yts(k-1);
    end
    
    fprintf(fid, '    {\n');
    fprintf(fid, '      "xts": %g,\n', x_c);
    fprintf(fid, '      "yts": %g\n',   y_c);

    if k < 16
        fprintf(fid, '    },\n');
    else
        fprintf(fid, '    }\n');
    end
end
fprintf(fid, '  ]\n');
fprintf(fid, '}\n');

% Close the output file
fclose(fid);
