% Animate BP06 Celeris-WebGPU surface output as x-z transects.
%
% This reads the saved eta surfaces from output/elev_*.bin and plots the
% island-centerline free surface over the fixed bathymetry/topography.

clear all
close all
clf

% -------------------------------------------------------------------------
% File locations and grid information written by Celeris
% -------------------------------------------------------------------------

output_dir = fullfile(pwd,'output');

nx = readmatrix(fullfile(output_dir,'nx.txt'));
ny = readmatrix(fullfile(output_dir,'ny.txt'));
dx = readmatrix(fullfile(output_dir,'dx.txt'));
dy = readmatrix(fullfile(output_dir,'dy.txt'));

x = (0:nx-1)'*dx;
y = (0:ny-1)'*dy;
island_center_y = 13.80;
jmid = round(island_center_y/dy) + 1;

% -------------------------------------------------------------------------
% Load bathymetry and list the saved eta frames
% -------------------------------------------------------------------------

fid = fopen(fullfile(output_dir,'bathytopo.bin'),'r');
bathy = fread(fid,[nx ny],'single');
fclose(fid);
bathy_line = bathy(:,jmid);

elev_files = dir(fullfile(output_dir,'elev_*.bin'));
frame_number = zeros(length(elev_files),1);
for k = 1:length(elev_files)
    frame_number(k) = sscanf(elev_files(k).name,'elev_%d.bin');
end
[frame_number,sort_index] = sort(frame_number);
elev_files = elev_files(sort_index);

% -------------------------------------------------------------------------
% Animate the saved free-surface transects
% -------------------------------------------------------------------------

figure(1)
set(gcf,'Color','w')

for k = 1:length(elev_files)
    model_time = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));

    fid = fopen(fullfile(output_dir,elev_files(k).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);
    eta_line = eta(:,jmid);

    clf
    pcolor(x,y,eta')
    hold on
    shading interp
    xlabel('x (m)')
    ylabel('y (m)')
    caxis([-.1 .1]*.1)
    title(sprintf('BP06 Case B Celeris centerline surface, frame %d, t = %.2f s', ...
        frame_number(k),model_time))
    drawnow
    pause(0.1)
end
