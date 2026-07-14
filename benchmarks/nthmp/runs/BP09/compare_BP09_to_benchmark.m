% Compare BP09 Celeris-WebGPU output with available Okushiri benchmark data.
%
% Run this from benchmarks/nthmp/runs/BP09 after the nested WebGPU sequence
% has produced output/ folders in the grid directories.

clear all
close all
clf

% -------------------------------------------------------------------------
% File locations
% -------------------------------------------------------------------------

run_dir = pwd;
ref_dir = fullfile(run_dir,'..','..','reference_data','BP09');
field_data_file = fullfile(ref_dir,'FieldData.xlsx');

grid_dirs = {'gridA_okushiri'; 'gridB_south_okushiri'; 'gridC_aonae'; 'gridC_monai'};
runup_threshold = 0.05; % meters

% -------------------------------------------------------------------------
% Tide-gauge comparison on Grid A
% -------------------------------------------------------------------------

grid_a_dir = fullfile(run_dir,'gridA_okushiri');
grid_a_output = fullfile(grid_a_dir,'output');
grid_a_analysis = fullfile(grid_a_dir,'analysis');

elev_files = dir(fullfile(grid_a_output,'elev_*.bin'));
if ~isempty(elev_files)
    if ~exist(grid_a_analysis,'dir')
        mkdir(grid_a_analysis)
    end

    cfg = jsondecode(fileread(fullfile(grid_a_dir,'config.json')));
    nx = readmatrix(fullfile(grid_a_output,'nx.txt'));
    ny = readmatrix(fullfile(grid_a_output,'ny.txt'));
    dx = readmatrix(fullfile(grid_a_output,'dx.txt'));
    dy = readmatrix(fullfile(grid_a_output,'dy.txt'));
    lon = cfg.lon_LL + (0:nx-1)'*dx;
    lat = cfg.lat_LL + (0:ny-1)*dy;

    frame_number = zeros(length(elev_files),1);
    for k = 1:length(elev_files)
        frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
    end
    [frame_number,sort_index] = sort(frame_number);
    elev_files = elev_files(sort_index);

    model_time = zeros(length(elev_files),1);
    model_eta = zeros(length(elev_files),2);
    gauge_lon = [140.50; 140.133333];
    gauge_lat = [42.98; 41.866667];

    for k = 1:length(elev_files)
        model_time(k) = readmatrix(fullfile(grid_a_output,sprintf('time_%d.txt',frame_number(k))));

        fid = fopen(fullfile(grid_a_output,elev_files(k).name),'r');
        eta = fread(fid,[nx ny],'single');
        fclose(fid);

        for n = 1:2
            model_eta(k,n) = interp2(lon,lat,eta',gauge_lon(n),gauge_lat(n),'linear');
        end
    end

    iwanai = readmatrix(field_data_file,'Sheet','Iwanai');
    esashi = readmatrix(field_data_file,'Sheet','Esashi');

    ref_iwanai_time = iwanai(:,1)*60.0;
    ref_iwanai_eta = iwanai(:,2);
    ref_esashi_time = esashi(:,1)*60.0;
    ref_esashi_eta = esashi(:,2);

    ref_iwanai_on_model = interp1(ref_iwanai_time,ref_iwanai_eta,model_time,'linear',NaN);
    ref_esashi_on_model = interp1(ref_esashi_time,ref_esashi_eta,model_time,'linear',NaN);

    gauge_label = {'Iwanai'; 'Esashi'};
    rmse = [
        sqrt(mean((model_eta(:,1)-ref_iwanai_on_model).^2,'omitnan'));
        sqrt(mean((model_eta(:,2)-ref_esashi_on_model).^2,'omitnan'))];
    mean_abs_error = [
        mean(abs(model_eta(:,1)-ref_iwanai_on_model),'omitnan');
        mean(abs(model_eta(:,2)-ref_esashi_on_model),'omitnan')];
    max_abs_error = [
        max(abs(model_eta(:,1)-ref_iwanai_on_model),[],'omitnan');
        max(abs(model_eta(:,2)-ref_esashi_on_model),[],'omitnan')];
    gauge_metrics = table(gauge_label,rmse,mean_abs_error,max_abs_error);
    writetable(gauge_metrics,fullfile(grid_a_analysis,'bp09_gridA_tide_gauge_metrics.csv'));

    figure(1)
    clf
    tiledlayout(2,1)

    nexttile
    plot(ref_iwanai_time,ref_iwanai_eta,'k-','LineWidth',1.2)
    hold on
    plot(model_time,model_eta(:,1),'r-o','LineWidth',1.0)
    grid on
    xlabel('time (s)')
    ylabel('eta (m)')
    title('BP09 Iwanai')
    legend('Observed','Celeris eta surface samples','Location','best')

    nexttile
    plot(ref_esashi_time,ref_esashi_eta,'k-','LineWidth',1.2)
    hold on
    plot(model_time,model_eta(:,2),'r-o','LineWidth',1.0)
    grid on
    xlabel('time (s)')
    ylabel('eta (m)')
    title('BP09 Esashi')
    legend('Observed','Celeris eta surface samples','Location','best')

    saveas(gcf,fullfile(grid_a_analysis,'bp09_gridA_tide_gauge_comparison.png'))
    saveas(gcf,fullfile(grid_a_analysis,'bp09_gridA_eta_surface_tide_gauge_comparison.png'))
    disp(gauge_metrics)
end

% -------------------------------------------------------------------------
% Maximum runup summaries for each grid
% -------------------------------------------------------------------------

runup_grid = {};
runup_max_m = [];
runup_lon = [];
runup_lat = [];
runup_cell_count = [];

for g = 1:length(grid_dirs)
    grid_dir = fullfile(run_dir,grid_dirs{g});
    output_dir = fullfile(grid_dir,'output');
    analysis_dir = fullfile(grid_dir,'analysis');

    if ~exist(fullfile(output_dir,'current_FSmax.bin'),'file')
        continue
    end
    if ~exist(analysis_dir,'dir')
        mkdir(analysis_dir)
    end

    cfg = jsondecode(fileread(fullfile(grid_dir,'config.json')));
    nx = readmatrix(fullfile(output_dir,'nx.txt'));
    ny = readmatrix(fullfile(output_dir,'ny.txt'));
    dx = readmatrix(fullfile(output_dir,'dx.txt'));
    dy = readmatrix(fullfile(output_dir,'dy.txt'));
    lon = cfg.lon_LL + (0:nx-1)'*dx;
    lat = cfg.lat_LL + (0:ny-1)*dy;

    fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
    bathy = fread(fid,[nx ny],'single');
    fclose(fid);

    fid = fopen(fullfile(output_dir,'current_FSmax.bin'),'r');
    fsmax = fread(fid,[nx ny],'single');
    fclose(fid);

    wet_land = bathy > 0 & fsmax > runup_threshold;
    [max_runup,runup_index] = max(fsmax(:).*wet_land(:));
    [ii,jj] = ind2sub(size(fsmax),runup_index);

    runup_grid{end+1,1} = grid_dirs{g}; %#ok<SAGROW>
    runup_max_m(end+1,1) = max_runup; %#ok<SAGROW>
    runup_lon(end+1,1) = lon(ii); %#ok<SAGROW>
    runup_lat(end+1,1) = lat(jj); %#ok<SAGROW>
    runup_cell_count(end+1,1) = sum(wet_land(:)); %#ok<SAGROW>

    figure(10+g)
    clf
    pcolor(lon,lat,fsmax')
    shading flat
    hold on
    contour(lon,lat,bathy',[0 0],'k-','LineWidth',1.0)
    axis equal tight
    colorbar
    title(sprintf('BP09 %s maximum free surface',grid_dirs{g}))
    xlabel('longitude')
    ylabel('latitude')
    saveas(gcf,fullfile(analysis_dir,[grid_dirs{g} '_FSmax.png']))
end

if ~isempty(runup_grid)
    runup_summary = table(runup_grid,runup_max_m,runup_lon,runup_lat,runup_cell_count);
    writetable(runup_summary,fullfile(run_dir,'bp09_matlab_runup_summary.csv'));
    disp(runup_summary)
end
