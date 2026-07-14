% Animate BP09 Celeris-WebGPU surface output for one selected grid.
%
% Change grid_name below to inspect a different grid output folder.

clear all
close all
clf

% -------------------------------------------------------------------------
% File locations and grid information written by Celeris
% -------------------------------------------------------------------------

grid_name = 'gridC_aonae';
grid_dir = fullfile(pwd,grid_name);
output_dir = fullfile(grid_dir,'output');
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

elev_files = dir(fullfile(output_dir,'elev_*.bin'));
frame_number = zeros(length(elev_files),1);
for k = 1:length(elev_files)
    frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
end
[frame_number,sort_index] = sort(frame_number);
elev_files = elev_files(sort_index);

% -------------------------------------------------------------------------
% Animate the saved free-surface maps
% -------------------------------------------------------------------------

figure(1)
set(gcf,'Color','w')

for k = 1:length(elev_files)
    model_time = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));

    fid = fopen(fullfile(output_dir,elev_files(k).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);

    clf
    pcolor(lon,lat,eta')
    shading flat
    hold on
    contour(lon,lat,bathy',[0 0],'k-','LineWidth',1.0)
    axis equal tight
    colorbar
    xlabel('longitude')
    ylabel('latitude')
    title(sprintf('BP09 %s surface, frame %d, t = %.2f s', ...
        grid_name,frame_number(k),model_time))
    drawnow
    pause(0.1)
end
