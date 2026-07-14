% Compare BP04 Celeris-WebGPU output with the NTHMP laboratory benchmark.
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

% The reference files live outside the run directory so all BP04 runs can use
% the same benchmark data.
ref_dir = fullfile(run_dir,'..','..','..','reference_data','BP04');
ref_profile_tgz = fullfile(ref_dir,'profs.tgz');
ref_runup_file = fullfile(ref_dir,'Lab_runup.txt');
profile_dir = fullfile(analysis_dir,'bp04_profiles');

if ~exist(analysis_dir,'dir')
    mkdir(analysis_dir)
end
if ~exist(figure_dir,'dir')
    mkdir(figure_dir)
end
if ~exist(profile_dir,'dir')
    mkdir(profile_dir)
end
untar(ref_profile_tgz,profile_dir)

% -------------------------------------------------------------------------
% Basic run constants
% -------------------------------------------------------------------------

nx = readmatrix(fullfile(output_dir,'nx.txt'));
ny = readmatrix(fullfile(output_dir,'ny.txt'));
dx = readmatrix(fullfile(output_dir,'dx.txt'));
dy = readmatrix(fullfile(output_dir,'dy.txt'));

d = 0.30;
g = 9.80665;
profile_time_scale = sqrt(d/g);
wave_height_over_depth = 0.0185;
benchmark_left_x_over_d = -5.0;
x = (0:nx-1)'*dx;
y = (0:ny-1)*dy;
x_over_d = x/d + benchmark_left_x_over_d;
jmid = round(ny/2);

% -------------------------------------------------------------------------
% Load saved eta surfaces
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
bathy = fread(fid,[nx ny],'single');
fclose(fid);
bathy_line = bathy(:,jmid)/d;

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
surface_time_over_T = surface_time/profile_time_scale;

% -------------------------------------------------------------------------
% Free-surface profile comparison
% -------------------------------------------------------------------------

profile_times = [30 40 50 60 70];
profile_rmse = zeros(length(profile_times),1);
profile_mean_abs_error = zeros(length(profile_times),1);
profile_max_abs_error = zeros(length(profile_times),1);
model_time_over_T = zeros(length(profile_times),1);
model_frame = zeros(length(profile_times),1);

figure(1)
clf
tiledlayout(3,2)

for k = 1:length(profile_times)
    target_time = profile_times(k);
    ref_profile = readmatrix(fullfile(profile_dir,sprintf('Case0_0185.t=%d',target_time)),'FileType','text');
    ref_x = ref_profile(:,1);
    ref_eta = ref_profile(:,2);

    [~,itime] = min(abs(surface_time_over_T - target_time));

    fid = fopen(fullfile(output_dir,elev_files(itime).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);

    model_eta = eta(:,jmid)/d;
    model_eta_on_ref_x = interp1(x_over_d,model_eta,ref_x,'linear',NaN);

    profile_error = model_eta_on_ref_x - ref_eta;
    profile_rmse(k) = sqrt(mean(profile_error.^2,'omitnan'));
    profile_mean_abs_error(k) = mean(abs(profile_error),'omitnan');
    profile_max_abs_error(k) = max(abs(profile_error),[],'omitnan');
    model_time_over_T(k) = surface_time_over_T(itime);
    model_frame(k) = frame_number(itime);

    nexttile
    plot(ref_x,ref_eta,'ks','LineWidth',1.5)
    hold on
    plot(x_over_d,model_eta,'r--','LineWidth',1.2)
    plot(x_over_d,bathy_line,'y-','LineWidth',2)
    grid on
    xlim([-2 25])
    ylim([-0.03 0.07])
    xlabel('x / d')
    ylabel('eta / d')
    title(sprintf('t = %.0f, Celeris %.2f',target_time,model_time_over_T(k)))
end

saveas(gcf,fullfile(figure_dir,'bp04_case_a_profile_comparison.png'))

profile_metrics = table(profile_times',model_time_over_T,model_frame, ...
    profile_rmse,profile_mean_abs_error,profile_max_abs_error, ...
    'VariableNames',{'target_t','model_t','model_frame', ...
    'rmse','mean_abs_error','max_abs_error'});
writetable(profile_metrics,fullfile(analysis_dir,'bp04_case_a_matlab_profile_metrics.csv'));

% -------------------------------------------------------------------------
% Maximum runup comparison
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
bathy = fread(fid,[nx ny],'single');
fclose(fid);

fid = fopen(fullfile(output_dir,'current_FSmax.bin'),'r');
fsmax = fread(fid,[nx ny],'single');
fclose(fid);

% current_FSmax.bin can include dry-bed elevations on dry land.  Require a
% positive inundation depth and use the highest wetted bed elevation as R.
wet_threshold = 0.001;
wet_depth = fsmax - bathy;
wet_beach = bathy > 0 & wet_depth > wet_threshold;
model_runup_over_d = max(bathy(wet_beach))/d;
model_runup_fs_over_d = max(fsmax(wet_beach))/d;
[~,runup_index] = max(bathy(:).*wet_beach(:));
[runup_i,runup_j] = ind2sub(size(fsmax),runup_index);
model_runup_x_over_d = x_over_d(runup_i);
model_runup_bathy_over_d = bathy(runup_i,runup_j)/d;

ref_runup = readmatrix(ref_runup_file,'FileType','text','NumHeaderLines',3);
[~,runup_sort] = sort(abs(ref_runup(:,1)-wave_height_over_depth));
runup_subset = ref_runup(runup_sort(1:5),:);
benchmark_runup_over_d = 0.078;  % from Table 1 in Synolakis, 1985
runup_percent_error = 100*(model_runup_over_d - benchmark_runup_over_d)/benchmark_runup_over_d;

fid = fopen(fullfile(analysis_dir,'bp04_case_a_matlab_runup_metric.txt'),'w');
fprintf(fid,'BP04 Case A maximum runup comparison\n');
fprintf(fid,'Celeris R/d: %.6f\n',model_runup_over_d);
fprintf(fid,'Celeris max FS/d on wetted beach: %.6f\n',model_runup_fs_over_d);
fprintf(fid,'Celeris runup x/d: %.6f\n',model_runup_x_over_d);
fprintf(fid,'Celeris bed elevation at runup z/d: %.6f\n',model_runup_bathy_over_d);
fprintf(fid,'Wet-depth threshold (m): %.6f\n',wet_threshold);
fprintf(fid,'Benchmark R/d, mean of nearest 5 lab points: %.6f\n',benchmark_runup_over_d);
fprintf(fid,'Percent error: %.2f\n',runup_percent_error);
fclose(fid);

disp(profile_metrics)
fprintf('Celeris R/d = %.6f, benchmark R/d = %.6f, error = %.2f percent\n', ...
    model_runup_over_d,benchmark_runup_over_d,runup_percent_error);
