import asyncHandler from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async(userId) => {
     try {
          const user = await User.findById(userId);
          const accessToken = user.generateAccessToken();
          const refreshToken = user.generateRefreshToken();
          user.refreshToken = refreshToken;
          await user.save({validateBeforeSave: false});

          return {accessToken, refreshToken};

     } catch (error) {
          throw new ApiError(500, "Something went wrong while generating tokens")
     }
};

const registerUser = asyncHandler(async (req, res) => {
   const {fullName, email, username, password} = req.body;

   if(
        [fullName, email, username, password].some((field) => 
        field?.trim() === "" || field === undefined )
   ){
        throw new ApiError(400, "All fields are required")
   }

   const existedUser = await User.findOne({
        $or: [{username},{email}]
   })
   if(existedUser){
        throw new ApiError(409, "User with email or username already exists")
   }

   //console.log("req.files", req.files);
   const avatarLocalPath = req.files?.avatar[0]?.path;
   const coverImageLocalPath = req.files?.coverImage[0]?.path;
   console.log("Avatar local path", avatarLocalPath);
   if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required");
   }
   
   const avatar = await uploadOnCloudinary(avatarLocalPath);
   const coverImage = await uploadOnCloudinary(coverImageLocalPath);
   if (!avatar){
        throw new ApiError(400, "Avatar file is required");
   }

   const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
   })

   const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
   )
   if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
   }

   return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
   )

});

const loginUser = asyncHandler(async (req, res) => {
     const{email, username, password} = req.body;
     if(!email && !username)
          throw new ApiError(400,"username or email is required");
     if(!password)
          throw new ApiError(400,"password is required");

     const user = await User.findOne({
          $or: [{username}, {email}]
     })
     if(!user)
          throw new ApiError(404,"user does not exist");

     const isPasswordValid = await user.isPasswordCorrect(password);
     if(!isPasswordValid)
          throw new ApiError(401,"Invalid user credentials");

     const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);
     const loggedInUser = await User.findById(user._id).select("-refreshToken -password");

     const options = {
          httpOnly: true,
          secure: true
     }

     return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", refreshToken, options)
     .json(
          new ApiResponse(200,{
               user: loggedInUser, accessToken, refreshToken
          },"User logged in successfully")
     )

});

const logoutUser = asyncHandler(async (req,res) =>{
     await User.findByIdAndUpdate(req.user._id,
          {
               $set: {refreshToken: undefined}
          },
          {
               new: true
          }
     );

     const options = {
          httpOnly: true,
          secure: true
     }

     return res
     .status(200)
     .clearCookie("accessToken", options)
     .clearCookie("refreshToken", options)
     .json(new ApiResponse(200, {}, "User logged Out"))
});

const refreshAccessToken = asyncHandler(async (req,res) =>{
     const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
     if(!incomingRefreshToken){
          throw new ApiError (401, "Unauthorized Request")
     }

     const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_EXPIRY);
     const user = await User.findById(decodedToken?._id);

     if(!user){
          throw new ApiError(401, "Invalid refresh token");
     }

     if(incomingRefreshToken !== user?.refreshToken){
          throw new ApiError(401, "Refresh token is expired or used");
     }

     const options = {
          httpOnly: true,
          secure: true
     };

     const {newAccessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id);
     return res
     .status(200)
     .cookie("accessToken", newAccessToken, options)
     .cookie("refreshToken", newRefreshToken, options)
     .json(
          new ApiResponse(200,
               {
                    accessToken: newAccessToken, 
                    refreshToken: newRefreshToken
               },
               "Access Token Refreshed"
          )
     )
});

const changeCurrentPassword = asyncHandler(async (req,res) => {
     const {oldPassword, newPassword} = req.body;
     const user = await User.findById(req.user?._id);
     const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

     if(!isPasswordCorrect){
          throw new ApiError(400, "Invalid Old Password");
     }

     user.password = newPassword;
     await user.save({validateBeforeSave : false});

     return res
     .status(200)
     .json(new ApiResponse(200, {},"Password Changed successfully"))
});

const getCurrentUser = asyncHandler(async (req,res) => {
     return res
     .status(200)
     .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req,res) => {
     const {fullName, email} = req.body;

     if(!(fullName && email)){
          throw new ApiError(400, "All fields are required")
     }

     const user = await User.findByIdAndUpdate(
          req.user?._id, 
          {
               $set: {
                    fullName: fullName,
                    email: email
               }
          }, 
          {new: true}
     ).select("-password");

     return res
     .status(200)
     .json(new ApiResponse(200, user, "Account Details Updated Successfully"))
});

const updateUserAvatar = asyncHandler(async (req,res) => {
     const avatarLocalPath = req.file?.path;

     if(!avatarLocalPath){
          throw new ApiError(400, "Avatar File is missing");
     }

     const avatar = await uploadOnCloudinary(avatarLocalPath);

     if(!avatar.url){
          throw new ApiError(400, "Error while uploading avatar");
     }

     const user = await User.findByIdAndUpdate(
          req.user?._id,
          {
               $set: {
                    avatar: avatar.url
               }
          },
          {new: true}
     ).select("-password");

     //TODO -> delete old image;

     return res
     .status(200)
     .json(ApiResponse(200, user, "Avatar Image Updated Successfully"))
});

const updateUserCoverImage = asyncHandler(async (req,res) => {
     const coverImageLocalPath = req.file?.path;

     if(!coverImageLocalPath){
          throw new ApiError(400, "CoverImage File is missing");
     }

     const coverImage = await uploadOnCloudinary(coverImageLocalPath);

     if(!coverImage.url){
          throw new ApiError(400, "Error while uploading CoverImage");
     }

    const user = await User.findByIdAndUpdate(
          req.user?._id,
          {
               $set: {
                    coverImage: coverImage.url
               }
          },
          {new: true}
     ).select("-password");

     return res
     .status(200)
     .json(ApiResponse(200, user, "Cover Image Updated Successfully"))
});

const getUserChannelProfile = asyncHandler(async (req,res) => {
     const {username} = req.params;

     if(!username?.trim()){
          throw new ApiError(400, "username is missing");
     }

     const channel = await User.aggregate([
          {
               $match: {
                    username: username?.toLowerCase()
               }
          },
          {
               $lookup: {
                    from: "subscription",
                    localField: "_id",
                    foreignField: "channel",
                    as: "subscribers"  
               }
          },
          {
               $lookup: {
                    from: "subscription",
                    localField: "_id",
                    foreignField: "subscriber",
                    as: "subscribedTo"  
               } 
          },
          {
               $addFields: {
                   subscribersCount: {
                         $size: "$subscribers"
                   },
                   channelsSubscribedToCount: {
                         $size: "$subscribedTo"
                   },
                   isSubscribed: {
                         $cond: {
                              if:{$in : [req.user?._id, "$subscribers.subscriber"]},
                              then: true,
                              else: false
                         }
                   }
               }
          },
          {
               $project:{
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                    coverImage: 1,
                    email: 1,
                    subscribersCount: 1,
                    channelsSubscribedToCount: 1,
                    isSubscribed: 1
               }
          }
     ]);

     if(!channel?.length){
          throw new ApiError(404, "channel does not exists");
     }

     return res
     .status(200)
     .json(new ApiResponse(200, channel[0], "User channel fetched successfully"));
});

const getWatchHistory = asyncHandler(async (req,res) => {
     const user = await User.aggregate([
          {
               $match: {
                    //mongoose convers id to mongo db id automatically but not in aggregate pipeline
                    _id: new mongoose.Types.ObjectId(req.user._id)
               }
          },
          {
               $lookup: {
                    from: "videos",
                    localField: "watchHistory",
                    foreignField: "_id",
                    as: "watchHistory",
                    pipeline: [
                         {
                              $lookup: {
                                   from: "users",
                                   localField: "owner",
                                   foreignField: "_id",
                                   as: "owner",
                                   pipeline:[
                                        {
                                             $project: {
                                                  fullName: 1,
                                                  username: 1,
                                                  avatar: 1
                                             }
                                        }
                                   ]
                              }
                         },
                         {
                              $addFields:{
                                   owner: {
                                        $first: "$owner"
                                   }
                              }
                         }
                    ]
               }
          }
     ]);

     return res
     .status(200)
     .json(new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully"))
});

export { 
     registerUser, 
     loginUser, 
     logoutUser, 
     refreshAccessToken, 
     changeCurrentPassword, 
     getCurrentUser, 
     updateAccountDetails, 
     updateUserAvatar, 
     updateUserCoverImage,
     getUserChannelProfile,
     getWatchHistory
}