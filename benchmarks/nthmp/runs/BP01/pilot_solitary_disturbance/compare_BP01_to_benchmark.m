% Compare BP01 Celeris-WebGPU output with the NTHMP analytical benchmark.
%
% This script is intentionally local to this one run directory.  It assumes
% create_Celeris_inputs.m and run_WebGPU.py have already been run, so the files
% in output/ are the files to compare.

clear all
close all
clf

% -------------------------------------------------------------------------
% File locations
% -------------------------------------------------------------------------

run_dir = pwd;
output_dir = fullfile(run_dir,'output');
analysis_dir = fullfile(run_dir,'analysis');
figure_dir = fullfile(analysis_dir,'figures');

% The reference files live outside the run directory so all BP01 runs can use
% the same benchmark data.
ref_dir = fullfile(run_dir,'..','..','..','reference_data','BP01');
ref_ts_file = fullfile(ref_dir,'canonical_ts.txt');
ref_profile_file = fullfile(ref_dir,'canonical_profiles.txt');

if ~exist(analysis_dir,'dir')
    mkdir(analysis_dir)
end
if ~exist(figure_dir,'dir')
    mkdir(figure_dir)
end

% -------------------------------------------------------------------------
% Basic run constants
% -------------------------------------------------------------------------

% Celeris writes the grid dimensions and spacing beside the binary surfaces.
% Use these files directly so the processor follows the output, not the input
% config that created it.
nx = readmatrix(fullfile(output_dir,'nx.txt'));
ny = readmatrix(fullfile(output_dir,'ny.txt'));
dx = readmatrix(fullfile(output_dir,'dx.txt'));
dy = readmatrix(fullfile(output_dir,'dy.txt'));

% BP01 is nondimensional with d=1.  The run was generated with g=9.80665.
d = 1.0;
g = 9.80665;
tau = sqrt(d/g);

% For grid_type=1, Celeris x=0 is the left boundary.  In the NTHMP BP01
% benchmark coordinate system, that same point is x/d=-5.
benchmark_left_x_over_d = -5.0;
x = (0:nx-1)'*dx;
x_over_d = x/d + benchmark_left_x_over_d;
jmid = round(ny/2);

% -------------------------------------------------------------------------
% Load saved eta surfaces
% -------------------------------------------------------------------------

% Each saved eta surface has a matching time_#.txt file.  These files are the
% cleanest source for BP01 comparison because they give a complete surface at
% each write time.  The gauge comparisons below sample these surfaces directly.
elev_files = dir(fullfile(output_dir,'elev_*.bin'));
frame_number = zeros(length(elev_files),1);
for k = 1:length(elev_files)
    frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
end
[frame_number,sort_index] = sort(frame_number);
elev_files = elev_files(sort_index);

surface_time = zeros(length(elev_files),1);
for k = 1:length(elev_files)
    surface_time(k) = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));
end
surface_time_over_tau = surface_time/tau;

% -------------------------------------------------------------------------
% Time-series comparison at x/d = 0.25 and x/d = 9.95
% -------------------------------------------------------------------------

% Sample the two benchmark gauges directly from the saved eta surfaces.
% The gauge x values below are first stated in benchmark x/d, then shifted
% into Celeris coordinates where the left boundary is x=0.
gauge_x_over_d = [0.25; 9.95];
gauge_x = (gauge_x_over_d - benchmark_left_x_over_d)*d;
gauge_y = 0.5*(ny-1)*dy*ones(size(gauge_x));
gauge_eta = zeros(length(elev_files),length(gauge_x));
y = (0:ny-1)*dy;
max_eta = -inf(nx,ny);

for k = 1:length(elev_files)
    fid = fopen(fullfile(output_dir,elev_files(k).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);

    max_eta = max(max_eta,eta);

    for n = 1:length(gauge_x)
        gauge_eta(k,n) = interp2(x,y,eta',gauge_x(n),gauge_y(n),'linear');
    end
end

model_t1 = surface_time_over_tau;
model_eta1 = gauge_eta(:,1)/d;
model_t2 = surface_time_over_tau;
model_eta2 = gauge_eta(:,2)/d;

% The NTHMP reference file has four columns:
%   t/tau, eta/d at x/d=0.25, t/tau, eta/d at x/d=9.95
% The two gauges have different output lengths, so the missing trailing
% columns are left as NaN by readmatrix.
ref_ts = readmatrix(ref_ts_file,'FileType','text','NumHeaderLines',5);

ref_t1 = ref_ts(:,1);
ref_eta1 = ref_ts(:,2);
ref_t2 = ref_ts(:,3);
ref_eta2 = ref_ts(:,4);

keep1 = isfinite(ref_t1) & isfinite(ref_eta1);
keep2 = isfinite(ref_t2) & isfinite(ref_eta2);
ref_t1 = ref_t1(keep1);
ref_eta1 = ref_eta1(keep1);
ref_t2 = ref_t2(keep2);
ref_eta2 = ref_eta2(keep2);

ref_eta1_on_model = interp1(ref_t1,ref_eta1,model_t1,'linear',NaN);
ref_eta2_on_model = interp1(ref_t2,ref_eta2,model_t2,'linear',NaN);

err1 = model_eta1 - ref_eta1_on_model;
err2 = model_eta2 - ref_eta2_on_model;

gauge_label = {'x/d = 0.25'; 'x/d = 9.95'};
rmse = [sqrt(mean(err1.^2,'omitnan')); sqrt(mean(err2.^2,'omitnan'))];
mean_abs_error = [mean(abs(err1),'omitnan'); mean(abs(err2),'omitnan')];
max_abs_error = [max(abs(err1),[],'omitnan'); max(abs(err2),[],'omitnan')];
bias = [mean(err1,'omitnan'); mean(err2,'omitnan')];
gauge_metrics = table(gauge_label,rmse,mean_abs_error,max_abs_error,bias);
writetable(gauge_metrics,fullfile(analysis_dir,'bp01_matlab_gauge_metrics.csv'));

figure(1)
clf
tiledlayout(2,1)

nexttile
plot(ref_t1,ref_eta1,'k-','LineWidth',1.5)
hold on
plot(model_t1,model_eta1,'r--','LineWidth',1.2)
grid on
xlabel('t / \tau')
ylabel('\eta / d')
title('BP01 Gauge x/d = 0.25')
legend('Analytical','Celeris','Location','best')

nexttile
plot(ref_t2,ref_eta2,'k-','LineWidth',1.5)
hold on
plot(model_t2,model_eta2,'r--','LineWidth',1.2)
grid on
xlabel('t / \tau')
ylabel('\eta / d')
title('BP01 Gauge x/d = 9.95')
legend('Analytical','Celeris','Location','best')

saveas(gcf,fullfile(figure_dir,'bp01_time_series_comparison.png'))

% -------------------------------------------------------------------------
% Free-surface profile comparison
% -------------------------------------------------------------------------

% The benchmark profile file contains x/d and eta/d profiles at fixed
% nondimensional times.
ref_profiles = readmatrix(ref_profile_file,'FileType','text','NumHeaderLines',5);
ref_x = ref_profiles(:,1);
ref_profile_eta = ref_profiles(:,3:2:17);
profile_times = [35 40 45 50 55 60 65 70];

profile_rmse = zeros(length(profile_times),1);
profile_mean_abs_error = zeros(length(profile_times),1);
profile_max_abs_error = zeros(length(profile_times),1);
model_time_over_tau = zeros(length(profile_times),1);
model_frame = zeros(length(profile_times),1);

figure(2)
clf
tiledlayout(4,2)

for k = 1:length(profile_times)
    target_time = profile_times(k);
    [~,itime] = min(abs(surface_time_over_tau - target_time));

    fid = fopen(fullfile(output_dir,elev_files(itime).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);

    model_eta = eta(:,jmid)/d;
    ref_eta = ref_profile_eta(:,k);
    model_eta_on_ref_x = interp1(x_over_d,model_eta,ref_x,'linear',NaN);

    profile_error = model_eta_on_ref_x - ref_eta;
    profile_rmse(k) = sqrt(mean(profile_error.^2,'omitnan'));
    profile_mean_abs_error(k) = mean(abs(profile_error),'omitnan');
    profile_max_abs_error(k) = max(abs(profile_error),[],'omitnan');
    model_time_over_tau(k) = surface_time_over_tau(itime);
    model_frame(k) = frame_number(itime);

    nexttile
    plot(ref_x,ref_eta,'k-','LineWidth',1.5)
    hold on
    plot(x_over_d,model_eta,'r--','LineWidth',1.2)
    grid on
    xlim([-2 20])
    xlabel('x / d')
    ylabel('\eta / d')
    title(sprintf('t/\\tau = %.0f, Celeris %.2f',target_time,model_time_over_tau(k)))
end

saveas(gcf,fullfile(figure_dir,'bp01_profile_comparison.png'))

profile_metrics = table(profile_times',model_time_over_tau,model_frame, ...
    profile_rmse,profile_mean_abs_error,profile_max_abs_error, ...
    'VariableNames',{'target_t_over_tau','model_t_over_tau','model_frame', ...
    'rmse','mean_abs_error','max_abs_error'});
writetable(profile_metrics,fullfile(analysis_dir,'bp01_matlab_profile_metrics.csv'));

% -------------------------------------------------------------------------
% Maximum runup comparison
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
bathy = fread(fid,[nx ny],'single');
fclose(fid);

% Do not compute runup from elev_*.bin.  In those plotted surface files,
% Celeris writes dry land cells at the topo elevation, so dry beach cells can
% look like positive eta.  The runup metric should come from current_FSmax.bin,
% which is the model's maximum free-surface field.
fid = fopen(fullfile(output_dir,'current_FSmax.bin'),'r');
fsmax = fread(fid,[nx ny],'single');
fclose(fid);

% Use initially dry beach cells and ignore roundoff-level wetting.
wet_threshold = 0.005;
wet_beach = bathy > 0 & fsmax > wet_threshold;
model_runup_over_d = max(fsmax(wet_beach))/d;
[~,runup_index] = max(fsmax(:).*wet_beach(:));
[runup_i,runup_j] = ind2sub(size(fsmax),runup_index);
model_runup_x_over_d = x_over_d(runup_i);
model_runup_bathy_over_d = bathy(runup_i,runup_j)/d;
benchmark_runup_over_d = max(ref_profile_eta,[],'all','omitnan');
runup_percent_error = 100*(model_runup_over_d - benchmark_runup_over_d)/benchmark_runup_over_d;

fid = fopen(fullfile(analysis_dir,'bp01_matlab_runup_metric.txt'),'w');
fprintf(fid,'BP01 maximum runup comparison\n');
fprintf(fid,'Celeris R/d: %.6f\n',model_runup_over_d);
fprintf(fid,'Celeris runup x/d: %.6f\n',model_runup_x_over_d);
fprintf(fid,'Celeris bed elevation at runup z/d: %.6f\n',model_runup_bathy_over_d);
fprintf(fid,'Benchmark R/d: %.6f\n',benchmark_runup_over_d);
fprintf(fid,'Percent error: %.2f\n',runup_percent_error);
fclose(fid);

disp(gauge_metrics)
disp(profile_metrics)
fprintf('Celeris R/d = %.6f, benchmark R/d = %.6f, error = %.2f percent\n', ...
    model_runup_over_d,benchmark_runup_over_d,runup_percent_error);
