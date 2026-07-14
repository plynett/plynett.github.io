% Script to create input files needed for WebGPU version of Celeris
% creates config.json, bathy.txt, waves.txt, and ts_west.txt

clear all
clf

% High-Level Simulation Control Parameters
grid_type = 1; % Cartesian grid. For grid_type=1, Celeris x=0 is the left boundary.
dx = 0.005; % uniform grid size to use in model - the loaded bathy files will be interpolated to this grid size
dy = 0.005;
NLSW_or_Bous = 1; % =0 for Nonlinear Shallow Water Solver (long waves only) otherwise Boussinesq (wind waves)
Courant_num = 0.15; %Target Courant #.  ~0.25 for P-C, ~0.05 for explicit methods. Default: 0.2
isManning = 0; % A boolean friction model value, if==1 "friction" is a Mannnigs n, otherwise it is a dimensionless friction factor (Moody)
friction = 0.0025;  % dimensionless friction coefficient, or Mannings "n", depending on isManning choice
min_allowable_depth = 0.00001; % min allowable water depth; keep the Celeris default for this breaking-wave case
infiltrationRate = 0.00;  % infiltration rate - for drying inundated cells
useBreakingModel = 1; % Case C is a breaking-wave case
algochanges=1; % 1=use new moving shoreline algorithm

% Benchmark Problem 7 setup
% BP07 uses the official Monai Valley bathymetry and a measured west-boundary
% time-series file.  It does not use Add Disturbance or an initial eta file.
base_depth = 0.13535;
loadetaIC = 0;
add_Disturbance = -1;

%  Boundary conditions - at least one of the boundaries should be = 2 for incident waves.
%  Boundary type 5 reads eta, hu, and hv from ts_west.txt.
west_boundary_type = 5; % west_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, 5=time series
east_boundary_type = 0; % east_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file
south_boundary_type = 0; % south_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file
north_boundary_type = 0; % north_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file
BoundaryWidth = 8;
incident_wave_type = 5;
numberOfWaves = 1;

% Time Series Parameters
maxdurationTimeSeries = 25;  % this is the time chunk to display and write discrete parts of the time series
NumberOfTimeSeries = 0;  % the maximum number of time series that can be added is 15
% List time series locations (in Celeris grid coordinates):
xts(1) = 4.521;  yts(1) = 1.196; % gauge 5
xts(2) = 4.521;  yts(2) = 1.696; % gauge 7
xts(3) = 4.521;  yts(3) = 2.196; % gauge 9
% add additional time series as needed

% Save trigger parameters for automatically saving data, these will be added to json
trigger_animation = 0;  % automation trigger for animated gif when = 1
trigger_animation_start_time = 0.0;  % start time of animation trigger
AnimGif_dt = 0.25;  % time between animated gif frames, will write 80 frames

% Surface output schedule
% Gauge comparisons are sampled directly from the saved eta surfaces.
trigger_writesurface = 1;  % automation trigger for writing 2D surfaces when = 1
trigger_writesurface_start_time = 0.0;  % start time of surface write trigger
trigger_writesurface_end_time = 22.0;  % end time of surface write trigger
dt_writesurface = 0.1;  % increment to write to file
write_eta = 1;  % flag for writing eta surface data to file, write when = 1
write_u = 0;  % flag for writing x velocity surface data to file, write when = 1
write_v = 0;  % flag for writing y velocity surface data to file, write when = 1
write_P = 0;  % flag for writing x flux surface data to file, write when = 1
write_Q = 0;  % flag for writing y flux surface data to file, write when = 1
write_turb = 1;  % flag for writing eddy visc surface data to file, write when = 1

trigger_writeWaveHeight = 1;  % automation trigger for writing mean/max/wave height surfaces when = 1
trigger_resetMeans_time = 0.0;  % time to reset means
trigger_resetWaveHeight_time = 0.0;  % time to reset wave height
trigger_writeWaveHeight_time = 22.5;  % time to write wave height, this is also the end time for the simulation
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
colorVal_min = -0.015;
colorVal_max = 0.05;
ShowLogos = 0;
GoogleMapOverlay = 0;
render_step = 10;
simPause = -1;

% Create bathy/topo surface - this needs to be custom for each scenario -
% see the interpBathy.m script in the directory below to see how the data
% is converted into a model grid
ref_dir = fullfile(pwd,'..','..','..','reference_data','BP07');
xyz = readmatrix(fullfile(ref_dir,'Benchmark_2_Bathymetry.txt'),'FileType','text','NumHeaderLines',1);
xvec = unique(xyz(:,1));
yvec = unique(xyz(:,2));
z_depth = reshape(xyz(:,3),length(yvec),length(xvec));

x=[min(xvec):dx:max(xvec)];
y=[min(yvec):dy:max(yvec)];
h_interp=interp2(xvec',yvec,-z_depth,x,y');

figure(1)
clf
pcolor(x,y,h_interp)
shading flat
axis equal tight
colorbar
title('BP07 Monai Valley Bathy/Topo')
xlabel('Celeris x (m)')
ylabel('Celeris y (m)')

pause(.1)
save bathy.txt h_interp -ascii

WIDTH = length(x); % //WIDTH
HEIGHT = length(y); % //HEIGHT
dx = mean(diff(x));  % //dx
dy = mean(diff(y));  %  //dy

% Write the west boundary type-5 time-series file from the measured input wave.
% The two stations apply the same measured eta along the full west boundary.
input_wave = readmatrix(fullfile(ref_dir,'Benchmark_2_input.txt'),'FileType','text','NumHeaderLines',1);
wave_time = input_wave(:,1);
wave_eta = input_wave(:,2);
wave_hu = wave_eta*sqrt(g*base_depth);
wave_hv = zeros(size(wave_eta));

figure(2)
clf
plot(wave_time,wave_eta)

fid = fopen('ts_west.txt','w');
fprintf(fid,'number_of_ts_along_boundary 2\n');
fprintf(fid,'%g %g\n',min(y),max(y));
for k = 1:length(wave_time)
    fprintf(fid,'%g %.12g %.12g %.12g %.12g %.12g %.12g\n', ...
        wave_time(k),wave_eta(k),wave_hu(k),wave_hv(k),wave_eta(k),wave_hu(k),wave_hv(k));
end
fclose(fid);

% write a dummy waves file; BP07 uses the type-5 boundary file, not waves.txt
fid = fopen('waves.txt','w');
fprintf(fid,'[NumberOfWaves] 1\n');
fprintf(fid,'=================================\n');
fprintf(fid,'0.0 10.0 0.0 0.0\n');
fclose(fid);

% write sim control data to file
data = [ grid_type, WIDTH, HEIGHT, dx, dy, Courant_num, NLSW_or_Bous, ...
            base_depth, g, Theta, friction, isManning, ...
            dissipation_threshold, whiteWaterDecayRate, timeScheme, ...
            seaLevel, Bcoef, tridiag_solve, west_boundary_type, ...
            east_boundary_type, south_boundary_type, north_boundary_type, ...
            BoundaryWidth, incident_wave_type, numberOfWaves, ...
            maxdurationTimeSeries, NumberOfTimeSeries, ...
            loadetaIC, add_Disturbance, ...
            surfaceToPlot, colorMap_choice, colorVal_min, colorVal_max, ...
            ShowLogos, GoogleMapOverlay, min_allowable_depth, useBreakingModel, ...
            render_step, simPause, ...
            trigger_animation, trigger_animation_start_time, AnimGif_dt, ...
            trigger_writesurface, trigger_writesurface_start_time, ...
            trigger_writesurface_end_time, dt_writesurface, infiltrationRate, ...
            write_eta, write_P, write_Q, write_u, write_v, write_turb, ...
            trigger_writeWaveHeight, trigger_resetMeans_time, trigger_resetWaveHeight_time, ...
            trigger_writeWaveHeight_time, which_surface_to_write, min_allowable_depth];
varnames = {'grid_type', 'WIDTH', 'HEIGHT', 'dx', 'dy', 'Courant_num', 'NLSW_or_Bous', ...
            'base_depth', 'g', 'Theta', 'friction', 'isManning', ...
            'dissipation_threshold', 'whiteWaterDecayRate', 'timeScheme', ...
            'seaLevel', 'Bcoef', 'tridiag_solve', 'west_boundary_type', ...
            'east_boundary_type', 'south_boundary_type', 'north_boundary_type', ...
            'BoundaryWidth', 'incident_wave_type', 'numberOfWaves', ...
            'maxdurationTimeSeries', 'NumberOfTimeSeries', ...
            'loadetaIC', 'add_Disturbance', ...
            'surfaceToPlot', 'colorMap_choice', 'colorVal_min', 'colorVal_max', ...
            'ShowLogos', 'GoogleMapOverlay', 'min_allowable_depth', 'useBreakingModel', ...
            'render_step', 'simPause', ...
            'trigger_animation', 'trigger_animation_start_time', 'AnimGif_dt', ...
            'trigger_writesurface', 'trigger_writesurface_start_time', ...
            'trigger_writesurface_end_time', 'dt_writesurface', 'infiltrationRate', ...
            'write_eta', 'write_P', 'write_Q', 'write_u', 'write_v', 'write_turb', ...
            'trigger_writeWaveHeight', 'trigger_resetMeans_time', 'trigger_resetWaveHeight_time', ...
            'trigger_writeWaveHeight_time', 'which_surface_to_write', 'min_allowable_depth'};

% Open the output file for writing
fid = fopen('config.json', 'w');
fprintf(fid, '{ \n');
% Write the data and variable names to the file
for i = 1:length(data)
    fprintf(fid, '  "%s": %.8f, \n' ,varnames{i} , data(i));
end
fprintf(fid, '  "ts_west_file": "ts_west.txt", \n');
fprintf(fid, '  "ts_east_file": "", \n');
fprintf(fid, '  "ts_south_file": "", \n');
fprintf(fid, '  "ts_north_file": "", \n');
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
