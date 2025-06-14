
reload = 0; % convert Celeris raw bin into netcdf
if reload == 1
    convert_WebGPUCeleris_output_to_netCDF
end

clear all

load combos.mat

load partition_info.txt
[num_partitions,~] = size(partition_info);

for part = 1:num_partitions

    fname_nc=['Celeris_datastack_' num2str(part) '.nc'];
    x = ncread(fname_nc,'x');
    y = ncread(fname_nc,'y');
    time = ncread(fname_nc,'time');

    bathytopo = ncread(fname_nc,'bathytopo');
    eta = ncread(fname_nc,'eta');
    [nx,ny,nt]=size(eta);

    dt=0.5*mean(diff(time));  % just calc time step of COULWAVE output
    time_interp = time(1):dt:time(end);  % can change this to whichever time limits you want to use for the FFT's

    if part == 1
        dx = x(2)-x(1);
        nx_all = partition_info(num_partitions,3);
        x_all=[0:dx:(nx_all-1)*dx];
        Hs=zeros(nx_all,ny);
        emean = Hs;
        Tp = Hs;
        Tm = Hs;
        Hs_25 = Hs;
        Hs_60 = Hs;
        Hs_120 = Hs;
        Hs_240 = Hs;
        bathytopo_all = Hs;

        nf_low=121;  % store amplitudes of the nf_low lowest frequencies from the fft
        amp_low=zeros(nx_all,ny,nf_low);
    end

    is = partition_info(part,2);
    ie = partition_info(part,3);
    bathytopo_all(is:ie,:) = bathytopo;

    i_shift = is - 1;
    for i=1:nx
        disp(['Calcing Bulk Stats: ' num2str(round(100*(i+i_shift)/nx_all)) '%'])
        for j=1:ny
            e_c = squeeze(eta(i,j,:));
            e=interp1(time,e_c,time_interp)';
            [Hs(i+i_shift,j),emean(i+i_shift,j),Tp(i+i_shift,j),Tm(i+i_shift,j),Hs_lf,f_select,amp_low(i+i_shift,j,:)]=distill_spec(time,e,nf_low);  % spectral analysis call
            Hs_25(i+i_shift,j)=Hs_lf(1);  % place low freq Hs's into own variable, Hs>25 sec
            Hs_60(i+i_shift,j)=Hs_lf(2);  % Hs>60s
            Hs_120(i+i_shift,j)=Hs_lf(3);  % Hs>120s

            if Hs(i+i_shift,j)<1e-3
                emean(i+i_shift,j)=0;
            end
        end
    end
end

x = x_all;
bathytopo = bathytopo_all;
save Celeris_stats.mat x y bathytopo Hs emean Tp Tm Hs_25 Hs_60 Hs_120 f_select amp_low

pcolor(x,y,Hs')
shading interp
colorbar

% for f=1:nf_low
%     1/f_select(f)
%     pcolor(x,y,2*sqrt(2)*squeeze(amp_low(:,:,f))')
%     shading interp
%     clim([0 .5])
%     colorbar
%     pause
% end




