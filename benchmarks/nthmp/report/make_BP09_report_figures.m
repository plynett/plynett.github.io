% Create BP09-only report figures from completed Celeris output.
%
% This script does not run the model.  It only reads the completed BP09
% output folders and writes journal-ready PNG files to report/figures.

clear all
close all
clf

report_dir = pwd;
figure_dir = fullfile(report_dir,'figures');
bp09_dir = fullfile(report_dir,'..','runs','BP09');

gridA_dir = fullfile(bp09_dir,'gridA_okushiri');
gridB_dir = fullfile(bp09_dir,'gridB_south_okushiri');
gridC_aonae_dir = fullfile(bp09_dir,'gridC_aonae');
gridC_monai_dir = fullfile(bp09_dir,'gridC_monai');

runup_threshold = 0.05;  % meters; same threshold used in compare_BP09_to_benchmark.m

% -------------------------------------------------------------------------
% Figure 13: nested-grid extents
% -------------------------------------------------------------------------

[lonA,latA,bathyA] = load_grid(gridA_dir);
[lonB,latB,bathyB] = load_grid(gridB_dir);

manifestB = jsondecode(fileread(fullfile(gridB_dir,'case_manifest.json')));
manifestC_aonae = jsondecode(fileread(fullfile(gridC_aonae_dir,'case_manifest.json')));
manifestC_monai = jsondecode(fileread(fullfile(gridC_monai_dir,'case_manifest.json')));

figure(1)
clf
set(gcf,'Color','w','Units','inches','Position',[1 1 7.0 3.6])
tiledlayout(1,2,'TileSpacing','compact','Padding','compact')

nexttile
imagesc(lonA,latA,bathyA')
set(gca,'YDir','normal')
hold on
contour(lonA,latA,bathyA',[0 0],'k-','LineWidth',0.8)
hB = draw_box(manifestB.grid.lon_ll,manifestB.grid.lon_ur, ...
    manifestB.grid.lat_ll,manifestB.grid.lat_ur,[0.95 0.05 0.05],2.0);
axis equal tight
xlabel('longitude')
ylabel('latitude')
title('Region A')
colormap(gca,parula)
caxis([-3500 500])
set(gca,'FontSize',10,'LineWidth',0.8,'Box','on')
legend(hB,'Grid B','Location','southwest','FontSize',8,'Box','on')

nexttile
imagesc(lonB,latB,bathyB')
set(gca,'YDir','normal')
hold on
contour(lonB,latB,bathyB',[0 0],'k-','LineWidth',0.8)
hCa = draw_box(manifestC_aonae.grid.lon_ll,manifestC_aonae.grid.lon_ur, ...
    manifestC_aonae.grid.lat_ll,manifestC_aonae.grid.lat_ur,[0.95 0.05 0.05],2.0);
hCm = draw_box(manifestC_monai.grid.lon_ll,manifestC_monai.grid.lon_ur, ...
    manifestC_monai.grid.lat_ll,manifestC_monai.grid.lat_ur,[0.05 0.45 0.95],2.0);
axis equal tight
xlabel('longitude')
ylabel('latitude')
title('Region B and final C grids')
colormap(gca,parula)
caxis([-800 100])
set(gca,'FontSize',10,'LineWidth',0.8,'Box','on')
legend([hCa hCm],{'C Aonae','C Monai'}, ...
    'Location','southeast','FontSize',8,'Box','on')

exportgraphics(gcf,fullfile(figure_dir,'fig_bp09_extents.png'),'Resolution',300)

% -------------------------------------------------------------------------
% Figures 20-23: free-surface snapshots
% -------------------------------------------------------------------------

target_time = [0 5 15 30]*60;
target_label = {'0 min','5 min','15 min','30 min'};

make_snapshot_figure(gridA_dir,fullfile(figure_dir,'fig_bp09_a_snapshots.png'), ...
    target_time,target_label,2)
make_snapshot_figure(gridB_dir,fullfile(figure_dir,'fig_bp09_b_snapshots.png'), ...
    target_time,target_label,3)
make_snapshot_figure(gridC_aonae_dir,fullfile(figure_dir,'fig_bp09_c_aonae_snapshots.png'), ...
    target_time,target_label,4)
make_snapshot_figure(gridC_monai_dir,fullfile(figure_dir,'fig_bp09_c_monai_snapshots.png'), ...
    target_time,target_label,5)

% -------------------------------------------------------------------------
% Figures 16-19: maximum free surface with dry land removed
% -------------------------------------------------------------------------

make_fsmax_figure(gridA_dir,fullfile(figure_dir,'fig_bp09_a_fsmax.png'),runup_threshold)
make_fsmax_figure(gridB_dir,fullfile(figure_dir,'fig_bp09_b_fsmax.png'),runup_threshold)
make_fsmax_figure(gridC_aonae_dir,fullfile(figure_dir,'fig_bp09_c_aonae_fsmax.png'),runup_threshold)
make_fsmax_figure(gridC_monai_dir,fullfile(figure_dir,'fig_bp09_c_monai_fsmax.png'),runup_threshold)

% -------------------------------------------------------------------------
% Local functions
% -------------------------------------------------------------------------

function [lon,lat,bathy] = load_grid(grid_dir)
    output_dir = fullfile(grid_dir,'output');
    config = jsondecode(fileread(fullfile(grid_dir,'config.json')));
    nx = readmatrix(fullfile(output_dir,'nx.txt'));
    ny = readmatrix(fullfile(output_dir,'ny.txt'));
    dx = readmatrix(fullfile(output_dir,'dx.txt'));
    dy = readmatrix(fullfile(output_dir,'dy.txt'));
    lon = config.lon_LL + (0:nx-1)'*dx;
    lat = config.lat_LL + (0:ny-1)*dy;

    fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
    bathy = fread(fid,[nx ny],'single');
    fclose(fid);
end

function h = draw_box(lon_min,lon_max,lat_min,lat_max,color,width)
    h = plot([lon_min lon_max lon_max lon_min lon_min], ...
        [lat_min lat_min lat_max lat_max lat_min], ...
        '-','Color',color,'LineWidth',width);
end

function eta = load_nearest_eta(grid_dir,target_time)
    output_dir = fullfile(grid_dir,'output');
    nx = readmatrix(fullfile(output_dir,'nx.txt'));
    ny = readmatrix(fullfile(output_dir,'ny.txt'));

    elev_files = dir(fullfile(output_dir,'elev_*.bin'));
    frame_number = zeros(length(elev_files),1);
    surface_time = zeros(length(elev_files),1);
    for k = 1:length(elev_files)
        frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
        surface_time(k) = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));
    end
    [~,itime] = min(abs(surface_time-target_time));

    fid = fopen(fullfile(output_dir,sprintf('elev_%d.bin',frame_number(itime))),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);
end

function make_snapshot_figure(grid_dir,out_file,target_time,target_label,fig_number)
    [lon,lat,bathy] = load_grid(grid_dir);

    figure(fig_number)
    clf
    set(gcf,'Color','w','Units','inches','Position',[1 1 5.2 5.8])
    tiledlayout(2,2,'TileSpacing','tight','Padding','tight')

    for n = 1:length(target_time)
        if target_time(n) == 0
            eta = readmatrix(fullfile(grid_dir,'IC.txt'))';
        else
            eta = load_nearest_eta(grid_dir,target_time(n));
        end
        total_depth = eta - bathy;
        eta(total_depth <= 0) = NaN;

        nexttile
        h = imagesc(lon,lat,eta');
        set(h,'AlphaData',isfinite(eta'))
        set(gca,'YDir','normal')
        hold on
        contour(lon,lat,bathy',[0 0],'k-','LineWidth',0.7)
        axis equal tight

        if max(lon)-min(lon) > 1
            lon_ticks = [138.5 139.5 140.5];
            lat_ticks = [41 42 43];
        else
            lon_ticks = linspace(min(lon),max(lon),3);
            lat_ticks = linspace(min(lat),max(lat),3);
        end
        if max(lon)-min(lon) < 0.04
            if mod(n,2) == 1
                xticks(lon_ticks(1))
            else
                xticks(lon_ticks(3))
            end
        elseif mod(n,2) == 1
            xticks(lon_ticks(1:2))
        else
            xticks(lon_ticks(2:3))
        end
        yticks(lat_ticks)

        if max(lon)-min(lon) < 0.1
            xtickformat('%.3f')
            ytickformat('%.3f')
        elseif max(lon)-min(lon) < 0.5
            xtickformat('%.2f')
            ytickformat('%.2f')
        else
            xtickformat('%.1f')
            ytickformat('%.0f')
        end

        if n > 2
            xlabel('longitude')
        else
            set(gca,'XTickLabel',[])
        end
        if mod(n,2) == 1
            ylabel('latitude')
        else
            set(gca,'YTickLabel',[])
        end

        title(['t = ' target_label{n}])
        caxis([-0.5 1])
        colormap(gca,parula)
        set(gca,'FontSize',9,'LineWidth',0.8,'Box','on')
    end

    cb = colorbar;
    cb.Layout.Tile = 'east';
    cb.Label.String = '\eta (m)';
    cb.Ticks = [-0.5 0 0.5 1];
    exportgraphics(gcf,out_file,'Resolution',300)
end

function make_fsmax_figure(grid_dir,out_file,runup_threshold)
    [lon,lat,bathy] = load_grid(grid_dir);
    output_dir = fullfile(grid_dir,'output');
    nx = readmatrix(fullfile(output_dir,'nx.txt'));
    ny = readmatrix(fullfile(output_dir,'ny.txt'));

    fid = fopen(fullfile(output_dir,'current_FSmax.bin'),'r');
    fsmax = fread(fid,[nx ny],'single');
    fclose(fid);

    dry_land = bathy > 0 & (fsmax-bathy) <= runup_threshold;
    fsmax(dry_land) = NaN;

    figure(10)
    clf
    set(gcf,'Color','w','Units','inches','Position',[1 1 5.2 4.6])
    h = imagesc(lon,lat,fsmax');
    set(h,'AlphaData',isfinite(fsmax'))
    set(gca,'YDir','normal')
    hold on
    contour(lon,lat,bathy',[0 0],'k-','LineWidth',0.8)
    axis equal tight
    xlabel('longitude')
    ylabel('latitude')
    colorbar
    colormap(parula)
    caxis([0 ceil(max(fsmax(:),[],'omitnan')/5)*5])
    set(gca,'FontSize',10,'LineWidth',0.8,'Box','on','Color','w')
    exportgraphics(gcf,out_file,'Resolution',300)
end
