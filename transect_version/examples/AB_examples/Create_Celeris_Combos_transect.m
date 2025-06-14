
clear all
clf

% parameters
% High-Level Simulation Control Parameters
NLSW_or_Bous =2; % =0 for Nonlinear Shallow Water Solver (long waves only) =1 standard Boussinesq, 2 = for Fully nonlinear Boussinesq
Accuracy_mode=1;   % 0 = 2nd order scheme, 1 = 4th order scheme
dx=1; % uniform grid size to use in model - the loaded bathy files will be interpolated to this grid size
Courant_num = 0.2; %Target Courant #.  ~0.25 for P-C, ~0.05 for explicit methods. Default: 0.2
isManning=0; % A boolean friction model value, if==1 "friction" is a Mannnigs n, otherwise it is a dimensionless friction factor (Moody)
friction=0.005;  % dimensionless friction coefficient, or Mannings "n", depending on isManning choice
useBreakingModel=1;  % Use breaking model
dzdt_I_coef=0.6;  % parameter to start breaking
dzdt_F_coef=0.15;  % parameter to end breaking
delta_breaking=2.0;   % breaking eddy viscosity scale
T_star_coef=4;  % time scale of breaking

west_boundary_type=2; % west_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, created by spectrum_2D above
east_boundary_type=0; % east_boundary_type, 0=solid wall, 1=sponge layer, 2= waves loaded from file, created by spectrum_2D above
            

% Defaults, should not need to change (for other parameters need to change source code
g=9.81;  %gravity
Theta=2.0;  %midmod limiter parameter; empirical breaking parameter. 1.0 most dissipative (upwind) to 2.0 least dissipative (centered) Default: 1.5
dissipation_threshold=0.3;  %For visualization purposes, represents a characterestic slope at breaking. 0.577=30 degrees, will need to be lower for coarse grid simulations that can not resolve this slope; 0.364=20 deg; 0.2679=15 deg
whiteWaterDecayRate=0.02; % For visualization purposes, not simulation. Default: 0.9
timeScheme=2;  %  Time integration choices: 0=Euler, 1=3rd-order A-B predictor, 2= A-B 4th-order predictor+corrector. Default: 2
seaLevel=0.0;  % water level shift from given datum, for tide, surge, etc
Bcoef=0.06666667; % dispersion parameter, 1/15 is optimum value for this set of equations. Default: 0.06666666666667
tridiag_solve=2; % Method to solve the tridiagonal Boussinesq system: =0 Thomas (extremely slow, only for small domains (nx,ny <500) due to thread memory req), =1 Gauss-Sid (very slow), or 2 parallel cyclic reduction (best). Default: 2
infiltrationRate=0.0001; % drys out the beach
min_allowable_depth=0.0005; % min flooding depth

% Create bathy/topo surface - this needs to be custom for each scenario -
% see the interpBathy.m script in the directory below to see how the data
% is converted into a model grid
GoogleMapOverlay = 0;

% create variables for ranges of inputs
depth = 5; % depth at wave generator
surge = [0, 1, 2, 3, 4]; % additional water level 
Hs = [0, 0.5, 1, 1.5, 2]; % short-wave sig wave height
Tp = [10, 12, 15, 20]; % peak wave period
HRMS = [0, 0.25, 0.5, 0.75, 1]; % H_RMS for IG wave
T_IG = [60, 96, 120, 240]; % IG wave periods

% create combinations and remove unuseful scenarios
combos = combinations(depth,surge,Hs,Tp,HRMS,T_IG); 
combos(find(combos.HRMS==0 & combos.Hs==0),:)=[];
[num_combos,num_parameters] = size(combos);
if num_combos > 2048
    error(['Number of Combinations per run limited to 2048, current value: ' num2str(num_combos)])
end

% load transect bathy
load bathy_1D.txt -ascii
z_bathy = bathy_1D(:,1);
h_bathy = bathy_1D(:,2);

% interp to dx
z_bathy = z_bathy-z_bathy(1);
x = [0:dx:z_bathy(end)];
B = interp1(z_bathy,h_bathy,x);

nx=length(x);

B_all=zeros(num_combos,nx);

for n=1:num_combos
    B_all(n,:) = B - B(1) - combos{n,1} - combos{n,2};  % set offshore elevation to -depth, and then add surge
end

figure(1)
clf
pcolor(x,1:num_combos,B_all)
shading interp
xlabel(' x(m) ')
ylabel('Combination Number')
title('Transect Elevation')
colorbar

save bathy.txt B_all -ascii

% create a frequency vector for all simulations to use
del_f=1/(30*60); % interval at which to calc discrete amplitude spectrum (Hz), should repeat in analysis time = 30 min
f_start=0.5/max(Tp);
f_end=  4.0/min(Tp);
f=[f_start:del_f:f_end];
nf=length(f) + 1; % plus one for the IG

amps_all=zeros(num_combos,nf);
periods_all = amps_all;
phases_all = amps_all;


for n=1:num_combos
    depth_c = combos{n,1} + combos{n,2};
    Hs_c = combos{n,3};
    Tp_c = combos{n,4};
    H_IG = combos{n,5};
    T_IG = combos{n,6};

    [amps,periods,phases] = spectrum_1D(f,depth_c,Hs_c,Tp_c,H_IG,T_IG);

    amps_all(n,:) = amps;
    periods_all(n,:) = periods;
    phases_all(n,:) = phases;
end


figure(2)
clf
pcolor(periods_all(1,2:end),1:num_combos,amps_all(:,2:end))
shading interp
xlabel(' Period (sec) ')
ylabel('Combination Number')
title('Amplitude')
colorbar

waves = [amps_all; periods_all; phases_all];
save waves.txt waves -ascii

% set Celeris paramters
WIDTH = nx;
HEIGHT = num_combos;
dy=dx;  % not used in transect model 
base_depth = max(depth) + max(surge);
numberOfWaves = nf;

% write sim control data to file
data = [ WIDTH, HEIGHT, dx, dy, Courant_num, NLSW_or_Bous, ...
    base_depth, g, Theta, friction, isManning, numberOfWaves,...
    dissipation_threshold, whiteWaterDecayRate, timeScheme, ...
    seaLevel*0, Bcoef, tridiag_solve, west_boundary_type, east_boundary_type,  ...
    infiltrationRate,min_allowable_depth,useBreakingModel,Accuracy_mode,  ...
    dzdt_I_coef,T_star_coef,delta_breaking,dzdt_F_coef];
varnames = {'WIDTH', 'HEIGHT', 'dx', 'dy', 'Courant_num', 'NLSW_or_Bous', ...
    'base_depth', 'g', 'Theta', 'friction', 'isManning', 'numberOfWaves', ...
    'dissipation_threshold', 'whiteWaterDecayRate', 'timeScheme', ...
    'seaLevel', 'Bcoef', 'tridiag_solve', 'west_boundary_type', 'east_boundary_type',  ...
    'infiltrationRate','min_allowable_depth','useBreakingModel','Accuracy_mode',  ...
    'dzdt_I_coef','T_star_coef','delta_breaking','dzdt_F_coef'};

% Open the output file for writing
fid = fopen('config.json', 'w');
fprintf(fid, '{ \n');
% Write the data and variable names to the file
for i = 1:length(data)-1
    fprintf(fid, '  "%s": %.8f, \n' ,varnames{i} , data(i));
end
i=i+1;
fprintf(fid, '  "%s": %.8f \n' ,varnames{i} , data(i));
fprintf(fid, '} \n');

% Close the output file
fclose all;


