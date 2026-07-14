% Compare BP07 Celeris-WebGPU output with the NTHMP Monai Valley benchmark.
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

ref_dir = fullfile(run_dir,'..','..','..','reference_data','BP07');
ref_ts_file = fullfile(ref_dir,'output_ch5-7-9.xls');
ref_runup_file = fullfile(ref_dir,'OBS_RUNUP.txt');

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

x = (0:nx-1)'*dx;
y = (0:ny-1)*dy;

gauge_id = [5; 7; 9];
gauge_label = {'gauge 1'; 'gauge 2'; 'gauge 3'};
gauge_x = [4.521; 4.521; 4.521];
gauge_y = [1.196; 1.696; 2.196];

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

% The lab gauge file stores time in seconds and gauge water levels in cm.
ref_ts = readmatrix(ref_ts_file);
ref_time = ref_ts(:,1);
ref_eta = ref_ts(:,2:4)/100.0;

rmse = zeros(length(gauge_id),1);
mean_abs_error = zeros(length(gauge_id),1);
max_abs_error = zeros(length(gauge_id),1);
bias = zeros(length(gauge_id),1);

for n = 1:length(gauge_id)
    ref_eta_on_model = interp1(ref_time,ref_eta(:,n),surface_time,'linear',NaN);
    gauge_error = gauge_eta(:,n) - ref_eta_on_model;
    rmse(n) = sqrt(mean(gauge_error.^2,'omitnan'));
    mean_abs_error(n) = mean(abs(gauge_error),'omitnan');
    max_abs_error(n) = max(abs(gauge_error),[],'omitnan');
    bias(n) = mean(gauge_error,'omitnan');
end

gauge_metrics = table(gauge_id,gauge_label,gauge_x,gauge_y, ...
    rmse,mean_abs_error,max_abs_error,bias);
writetable(gauge_metrics,fullfile(analysis_dir,'bp07_matlab_gauge_metrics.csv'));

figure(1)
clf
tiledlayout(3,1)

for n = 1:length(gauge_id)
    nexttile
    plot(ref_time,ref_eta(:,n),'k-','LineWidth',1.2)
    hold on
    plot(surface_time,gauge_eta(:,n),'r.','MarkerSize',8)
    grid on
    xlim([0 25])
    xlabel('time (s)')
    ylabel('eta (m)')
    title(sprintf('BP07 %s',gauge_label{n}))
    legend('Laboratory','Celeris eta surface samples','Location','best')
end

saveas(gcf,fullfile(figure_dir,'bp07_time_series_comparison.png'))
saveas(gcf,fullfile(figure_dir,'bp07_eta_surface_gauge_comparison.png'))

% -------------------------------------------------------------------------
% Maximum runup comparison
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'current_FSmax.bin'),'r');
fsmax = fread(fid,[nx ny],'single');
fclose(fid);

obs_runup = readmatrix(ref_runup_file,'FileType','text','NumHeaderLines',16);
obs_runup = obs_runup(isfinite(obs_runup(:,1)),:);
ds=3*dx;
obs_x = obs_runup(:,1)-ds;
obs_y = obs_runup(:,2);
benchmark_runup = mean(obs_runup(:,3:end),2);
model_runup = interp2(x,y,fsmax',obs_x,obs_y,'linear');
runup_error = model_runup - benchmark_runup;

runup_table = table(obs_x,obs_y,benchmark_runup,model_runup,runup_error, ...
    'VariableNames',{'x_m','y_m','benchmark_runup_m','model_runup_m','error_m'});
writetable(runup_table,fullfile(analysis_dir,'bp07_matlab_runup_metrics.csv'));

figure(2)
clf
plot(1:length(benchmark_runup),benchmark_runup,'k-o','LineWidth',1.2)
hold on
plot(1:length(model_runup),model_runup,'r-s','LineWidth',1.2)
grid on
xlabel('runup point')
ylabel('runup (m)')
title('BP07 observed runup points')
legend('Laboratory mean','Celeris','Location','best')
saveas(gcf,fullfile(figure_dir,'bp07_runup_comparison.png'))

disp(gauge_metrics)
disp(runup_table)
