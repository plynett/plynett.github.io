% Animate BP07 Celeris-WebGPU surface output as 2D eta maps.
%
% This reads the saved eta surfaces from output/elev_*.bin and plots each
% free-surface frame over the Monai Valley model grid.

clear all
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
y = (0:ny-1)*dy;

% -------------------------------------------------------------------------
% Load bathymetry and list the saved eta frames
% -------------------------------------------------------------------------

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
    pcolor(x,y,eta')
    shading flat
    hold on
    contour(x,y,bathy',[0 0],'k-','LineWidth',1.0)
    axis equal tight
    caxis([-0.01 0.03])
    colorbar
    xlabel('x (m)')
    ylabel('y (m)')
    title(sprintf('BP07 Monai Valley surface, frame %d, t = %.2f s', ...
        frame_number(k),model_time))
    drawnow
    pause(0.1)
end
