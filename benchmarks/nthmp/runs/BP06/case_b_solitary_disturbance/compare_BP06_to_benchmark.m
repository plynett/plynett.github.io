% Compare BP06 Celeris-WebGPU output with the NTHMP laboratory benchmark.
%
% This script is intentionally local to this one run directory.  It assumes
% create_Celeris_inputs.m and run_WebGPU.py have already been run, so the files
% in output/ are the files to compare.

clear all
clf

% -------------------------------------------------------------------------
% File locations
% -------------------------------------------------------------------------

run_dir = pwd;
output_dir = fullfile(run_dir,'output');
analysis_dir = fullfile(run_dir,'analysis');
figure_dir = fullfile(analysis_dir,'figures');

% The reference files live outside the run directory so all BP06 runs can use
% the same benchmark data.
ref_dir = fullfile(run_dir,'..','..','..','reference_data','BP06');
ref_ts_file = fullfile(ref_dir,'ts2b.txt');
ref_runup_file = fullfile(ref_dir,'run2b.txt');

if ~exist(analysis_dir,'dir')
    mkdir(analysis_dir)
end
if ~exist(figure_dir,'dir')
    mkdir(figure_dir)
end

% -------------------------------------------------------------------------
% Basic run constants
% -------------------------------------------------------------------------

nx = readmatrix(fullfile(output_dir,'nx.txt'));
ny = readmatrix(fullfile(output_dir,'ny.txt'));
dx = readmatrix(fullfile(output_dir,'dx.txt'));
dy = readmatrix(fullfile(output_dir,'dy.txt'));

d = 0.32;
x = (0:nx-1)'*dx;
y = (0:ny-1)*dy;
island_center_x = 12.96;
island_center_y = 13.80;

gauge_id = [1; 2; 3; 4; 6; 9; 16; 22];
gauge_label = {'g1'; 'g2'; 'g3'; 'g4'; 'g6'; 'g9'; 'g16'; 'g22'};
gauge_x = [6.82; 6.82; 6.82; 6.82; 9.36; 10.36; 12.96; 15.56];
gauge_y = [16.05; 14.55; 13.05; 11.55; 13.80; 13.80; 11.22; 13.80];
required_gauge = [0; 0; 0; 0; 0; 1; 1; 1];

% -------------------------------------------------------------------------
% Load written eta surfaces and sample gauges directly from elev_*.bin files.
% -------------------------------------------------------------------------

elev_files = dir(fullfile(output_dir,'elev_*.bin'));
frame_number = zeros(length(elev_files),1);
for k = 1:length(elev_files)
    frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
end
[frame_number,sort_index] = sort(frame_number);
elev_files = elev_files(sort_index);

surface_time = zeros(length(elev_files),1);
gauge_eta = zeros(length(elev_files),length(gauge_id));

for k = 1:length(elev_files)
    surface_time(k) = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));

    fid = fopen(fullfile(output_dir,elev_files(k).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);

    for n = 1:length(gauge_id)
        gauge_eta(k,n) = interp2(x,y,eta',gauge_x(n),gauge_y(n),'linear');
    end
end

% -------------------------------------------------------------------------
% Gauge comparison
% -------------------------------------------------------------------------

% The NTHMP reference file has columns:
%   time, g1, g2, g3, g4, g6, g9, g16, g22
ref_ts = readmatrix(ref_ts_file,'FileType','text','NumHeaderLines',7);
ref_time = ref_ts(:,1);

rmse = zeros(length(gauge_id),1);
mean_abs_error = zeros(length(gauge_id),1);
max_abs_error = zeros(length(gauge_id),1);
bias = zeros(length(gauge_id),1);

for n = 1:length(gauge_id)
    ref_eta_on_model = interp1(ref_time,ref_ts(:,n+1),surface_time,'linear',NaN);
    gauge_error = gauge_eta(:,n) - ref_eta_on_model;
    rmse(n) = sqrt(mean(gauge_error.^2,'omitnan'));
    mean_abs_error(n) = mean(abs(gauge_error),'omitnan');
    max_abs_error(n) = max(abs(gauge_error),[],'omitnan');
    bias(n) = mean(gauge_error,'omitnan');
end

gauge_metrics = table(gauge_id,gauge_label,required_gauge,gauge_x,gauge_y, ...
    rmse,mean_abs_error,max_abs_error,bias);
writetable(gauge_metrics,fullfile(analysis_dir,'bp06_case_b_matlab_gauge_metrics.csv'));

figure(1)
clf
tiledlayout(3,1)
plot_gauges = [6 7 8];

model_time_shift=27.6;
ref_time_scale=ref_time*sqrt(9.81/d)-155;
surf_time_scaled = (surface_time+model_time_shift)*sqrt(9.81/d)-160;
for p = 1:length(plot_gauges)
    n = plot_gauges(p);
    nexttile
    plot(ref_time_scale,ref_ts(:,n+1)/d,'k.','LineWidth',1.2)
    hold on
    plot(surf_time_scaled,gauge_eta(:,n)/d,'r-','MarkerSize',8)
    grid on
    xlabel('time*(g/d)^{0.5}')
    ylabel('\eta/d')
    title(sprintf('BP06 Case B %s',gauge_label{n}))
    axis([0 70 -0.11 .15])
    legend('Laboratory','Celeris eta surface samples','Location','best')
end

saveas(gcf,fullfile(figure_dir,'bp06_case_b_eta_surface_gauge_comparison.png'))

% -------------------------------------------------------------------------
% Maximum runup around the island
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
bathy = fread(fid,[nx ny],'single');
fclose(fid);

fid = fopen(fullfile(output_dir,'current_FSmax.bin'),'r');
fsmax = fread(fid,[nx ny],'single');
fclose(fid);

ref_runup = readmatrix(ref_runup_file,'FileType','text','NumHeaderLines',10);
ref_deg = ref_runup(:,2);
ref_runup_over_d = ref_runup(:,4);

[X,Y] = ndgrid(x,y);
% The laboratory runup angles use 0 deg on the negative-y side of the island
% and 90 deg in the incoming wave direction.
angle_deg = mod(atan2d(X-island_center_x,island_center_y-Y),360);
wet_threshold = 0.005;
wet_depth = fsmax - bathy;
wet_island = bathy > 0 & wet_depth > wet_threshold;
angle_half_width = 5.0;

model_runup_over_d = zeros(length(ref_deg),1);
selected_cell_count = zeros(length(ref_deg),1);

for k = 1:length(ref_deg)
    angle_difference = abs(mod(angle_deg - ref_deg(k) + 180,360)-180);
    selected_cells = wet_island & angle_difference <= angle_half_width;
    model_runup_over_d(k) = max(bathy(selected_cells))/d;
    selected_cell_count(k) = sum(selected_cells(:));
end

percent_error = 100*(model_runup_over_d - ref_runup_over_d)./ref_runup_over_d;
runup_table = table(ref_runup(:,1),ref_deg,ref_runup(:,3),ref_runup_over_d, ...
    model_runup_over_d,percent_error,selected_cell_count, ...
    'VariableNames',{'rad','deg','reference_runup_cm','reference_runup_over_depth', ...
    'model_runup_over_depth','percent_error','selected_cell_count'});
writetable(runup_table,fullfile(analysis_dir,'bp06_case_b_matlab_runup_by_angle.csv'));

figure(2)
clf
plot(ref_deg,ref_runup_over_d,'k-o','LineWidth',1.2)
hold on
plot(ref_deg,model_runup_over_d,'r-s','LineWidth',1.2)
grid on
xlabel('angle (deg)')
ylabel('R / d')
title('BP06 Case B runup by angle')
legend('Laboratory','Celeris','Location','best')
saveas(gcf,fullfile(figure_dir,'bp06_case_b_runup_by_angle.png'))

disp(gauge_metrics)
disp(runup_table)
