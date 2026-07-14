% Animate BP06 Celeris-WebGPU surface output as x-z transects.
%
% This reads the saved eta surfaces from output/elev_*.bin and plots the
% island-centerline free surface over the fixed bathymetry/topography.

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
y = (0:ny-1)'*dy;

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
% Animate the saved free-surface transects
% -------------------------------------------------------------------------

figure(1)
clf
set(gcf,'Color','w')

plot_ns=[155 160 165 170];
max_obs_runup= [5.1575    1.8800];

for n = 1:length(plot_ns)
    k=plot_ns(n);
    model_time = readmatrix(fullfile(output_dir,sprintf('time_%d.txt',frame_number(k))));

    fid = fopen(fullfile(output_dir,elev_files(k).name),'r');
    eta = fread(fid,[nx ny],'single');
    fclose(fid);

    H=eta-bathy;
    dry_ind=find(H<0.0001);
    eta(dry_ind)=NaN;

    subplot(2,2,n)
    contour(x,y,bathy',[0:.01:.1],'k')
    hold on
    pcolor(x,y,eta')
    hold on
    plot(max_obs_runup(1),max_obs_runup(2),'r.','MarkerSize',30)  % max obs runup location
    shading interp
    xlabel('x (m)')
    ylabel('y (m)')
    caxis([-0.5 1]*.09)
    title(sprintf('BP07 Narrow Valley View, t = %.2f s', ...
        model_time))
    axis equal
    axis([4.7 5.2 1.7 2.1])
    colorbar
    drawnow
    pause(0.1)
end
