function [Hs,emean,Tp,Tm,Hs_lf,f_select,amp_select]=distill_spec(t,e,nf_low)
warning('off')
N=length(t);
delt=t(2)-t(1);
emean=mean(e);
esub = e-emean;

% compute Fourier coefficients for eta
Ce = fft(esub,N);
% estimate spectrum for u
Se = Ce.*conj(Ce)/N;
Se(round(N/2)+1+1:N)= [ ];
delf = 1/(delt*N);
Se(2:round(N/2)) = 2*Se(2:round(N/2))/(N*delf);
% check
var3=sum(Se)*delf;
% calculate Hm0
Hs = 4.004*sqrt(var3);
f=delf*[0:length(Se)-1];

sum_lf=zeros(4,1);
for i=1:length(f)
   if f(i)<=1/25
      sum_lf(1)=sum_lf(1)+Se(i);
   end
   if f(i)<=1/60
      sum_lf(2)=sum_lf(2)+Se(i);
   end
   if f(i)<=1/120
      sum_lf(3)=sum_lf(3)+Se(i);
   end
   if f(i)<=1/240
      sum_lf(4)=sum_lf(4)+Se(i);
   end
end

var_lf=sum_lf*delf;
Hs_lf = 4.004*sqrt(var_lf);

maxSe=max(Se);
for i=1:length(Se)
   if Se(i)==maxSe
      Tp=1/f(i);
   end
end

var4=sum(Se.*f')*delf;
Tm=var3/var4;

% fit for just low periods
f_select = f(1:nf_low);
amp_select = sqrt(Se(1:nf_low)*delf);


